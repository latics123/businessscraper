import { fetchBusinessData } from "@/actions/targetron"
import { supabase } from "@/lib/supabase"
import { verifyEmails } from "@/actions/million-verifier"
import { convertAndVerifyJson, downloadJsonAsFile, convertJsonToCsv } from "@/lib/utils"
import { sendTelegramMessage, sendTelegramFile } from "@/actions/telegram"
import { uploadToInstantly } from "@/actions/instantly"
import { areaCodeMap } from "@/lib/area-code-map"

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

    // ✅ Enrich with area codes using static map
if (formData.enrichWithAreaCodes) {
  try {
    const getPostalPrefix = (postal: string): string =>
      (postal || "").split(" ")[0].trim().toUpperCase()

    filteredData = filteredData.map(row => {
      const postalCode = row.postal_code || ""
      const prefix = getPostalPrefix(postalCode)
      const code = areaCodeMap[prefix] || ""

      if (!code) {
        console.warn(`🚫 No match for prefix "${prefix}" from postal code "${postalCode}"`)
      } else {
        console.log(`✅ Match: "${prefix}" → "${code}"`)
      }

      return {
        ...row,
        ["enrich area codes"]: code,
      }
    })

    toast({
      title: "Area Codes Enriched",
      description: "Postcode prefixes successfully mapped to area codes.",
    })
  } catch (err) {
    console.error("❌ Area code enrichment error:", err)
    toast({
      title: "Area Code Enrichment Failed",
      description: "Check logs for details.",
      variant: "destructive",
    })
  }
}

    setBusinessData(filteredData)

    await supabase.from("saved_json").insert([
      { json_data: filteredData, verified: false, created_at: new Date().toISOString() }
    ])

    let verifiedData = filteredData

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

    // if (downloadFiles) {
    //   downloadJsonAsFile(verifiedData, formData.jsonFileName)
    //   convertJsonToCsv(verifiedData, formData.csvFileName)
    //   toast({ title: "Files downloaded", description: "Local downloads completed." })
    // }

    if (sendToTelegram && formData.telegramBotToken && formData.telegramChatId) {
      await sendTelegramMessage(
        `<b>Business Scraper Results</b>\n\nFound ${filteredData.length} business records for ${formData.businessType} in ${formData.city}, ${formData.state}`,
        { botToken: formData.telegramBotToken, chatId: formData.telegramChatId }
      )
      await sendTelegramFile(JSON.stringify(verifiedData, null, 2), formData.jsonFileName, {
        botToken: formData.telegramBotToken,
        chatId: formData.telegramChatId,
      })
    }

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
