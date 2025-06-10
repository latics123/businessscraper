import { fetchBusinessData } from "@/actions/targetron"
import { supabase } from "@/lib/supabase"
import { verifyEmails } from "@/actions/million-verifier"
import { convertAndVerifyJson } from "@/lib/utils"
import { sendTelegramMessage, sendTelegramFile } from "@/actions/telegram"
import { uploadToInstantly } from "@/actions/instantly"
import path from "path"
import * as XLSX from "xlsx"

export async function runScrapePipeline({
  formData,
  downloadFiles = false,
  uploadToInstantlyEnabled = true,
  sendToTelegram = true,
  setBusinessData,
  toast,
}: {
  formData: any
  downloadFiles?: boolean
  uploadToInstantlyEnabled?: boolean
  sendToTelegram?: boolean
  setBusinessData: (data: any[]) => void
  toast: (msg: any) => void
}) {
  try {
    toast({ title: "Starting data collection", description: "Fetching business data from Targetron API..." })

    const data = await fetchBusinessData({
      apiKey: formData.targetronApiKey,
      country: formData.country,
      city: formData.city,
      state: formData.state,
      postalCode: formData.postalCode,
      businessType: formData.businessType || undefined,
      businessStatus: formData.businessStatus,
      limit: formData.limit,
      skipTimes: formData.skipTimes,
      addedFrom: formData.fromDate,
      addedTo: formData.toDate,
      withPhone: formData.phoneFilter === "with_phone" || formData.phoneFilter === "enter_phone",
      withoutPhone: formData.phoneFilter === "without_phone",
      enrichWithAreaCodes: formData.enrichWithAreaCodes,
      phoneNumber: formData.phoneFilter === "enter_phone" ? formData.phoneNumber : undefined,
    })

    if (!data || data.length === 0) {
      toast({ title: "No data found", description: "No business data matched the criteria.", variant: "destructive" })
      return
    }

    let filteredData = formData.phoneFilter === "without_phone"
      ? data.filter(item => !item.phone || ["", "n/a", "na", "none", "-", "--"].includes(item.phone.trim().toLowerCase()))
      : data

    // ✅ Enrich with area codes if enabled
    if (formData.enrichWithAreaCodes) {
      try {
        const filePath = path.join(process.cwd(), "public", "enrich-area-codes.xlsx")
        const workbook = XLSX.readFile(filePath)
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const areaCodes = XLSX.utils.sheet_to_json(sheet)

        const areaCodeMap = new Map()
        areaCodes.forEach((row: any) => {
          const prefix = row["postcode"]
          const code = row["telephone area code"]
          if (prefix && code) {
            areaCodeMap.set(prefix.trim().toUpperCase(), code.toString().trim())
          }
        })

        const getPostalPrefix = (postal: string) =>
          (postal || "").split(" ")[0].trim().toUpperCase()

        filteredData = filteredData.map(row => ({
          ...row,
          ["enrich area codes"]: areaCodeMap.get(getPostalPrefix(row.postal_code)) || "",
        }))
      } catch (err) {
        console.error("❌ Failed to enrich area codes:", err)
        toast({
          title: "Enrichment failed",
          description: "Could not enrich area codes from XLSX file.",
          variant: "destructive",
        })
      }
    }

    setBusinessData(filteredData)

    await supabase.from("saved_json").insert([
      { json_data: filteredData, verified: false, created_at: new Date().toISOString() }
    ])

    let verifiedData = filteredData

    // ✅ Email verification
    if (formData.verifyEmails && formData.connectEmailVerification && formData.millionApiKey) {
      const hasEmails = filteredData.some(i => i.email || i.email_1 || i.email_2 || i.email_3)
      if (hasEmails) {
        verifiedData = await verifyEmails(filteredData, formData.millionApiKey)
        verifiedData = await convertAndVerifyJson(verifiedData, formData.millionApiKey)
        setBusinessData(verifiedData)
        toast({ title: "Emails verified", description: "Verification complete." })
      } else {
        toast({ title: "Email verification skipped", description: "No emails to verify." })
      }
    }

    // ✅ Send to Telegram
    if (sendToTelegram && formData.telegramBotToken && formData.telegramChatId) {
      await sendTelegramMessage(
        `<b>Business Scraper Results</b>\n\nFound ${verifiedData.length} business records for ${formData.businessType} in ${formData.city}, ${formData.state}`,
        { botToken: formData.telegramBotToken, chatId: formData.telegramChatId }
      )
      await sendTelegramFile(JSON.stringify(verifiedData, null, 2), formData.jsonFileName, {
        botToken: formData.telegramBotToken,
        chatId: formData.telegramChatId,
      })
    }

    // ✅ Upload to Instantly
    if (
      uploadToInstantlyEnabled &&
      formData.addtocampaign &&
      formData.connectColdEmail &&
      formData.instantlyApiKey &&
      formData.instantlyCampaignId
    ) {
      const validLeads = verifiedData
        .filter(i => i.is_email_valid && i.email?.includes("@"))
        .map(i => ({
          email: i.email.trim(),
          first_name: i.email_first_name || i.email.split("@")[0] || "Unknown",
          last_name: i.email_last_name || "",
          custom_variables: {
            company: i.company_name || i.display_name || "",
            phone: i.phone || "",
            city: i.city || "",
            country: i.country || "",
            website: i.site || "",
          },
        }))

      if (validLeads.length > 0) {
        await uploadToInstantly(validLeads, {
          apiKey: formData.instantlyApiKey,
          listId: formData.instantlyListId,
          campaignId: formData.instantlyCampaignId,
        })
        toast({ title: "Uploaded to Instantly", description: `${validLeads.length} leads uploaded.` })
      } else {
        toast({ title: "No valid leads", description: "No verified leads available for Instantly." })
      }
    }

  } catch (err) {
    console.error("❌ Pipeline error:", err)
    toast({ title: "Process error", description: "Check console for details.", variant: "destructive" })
  }
}
