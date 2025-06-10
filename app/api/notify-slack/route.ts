import { NextResponse } from "next/server"
import axios from "axios"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const VERIFIED_HEADERS = [
  "display_name", "types", "type", "country_code", "state", "city", "county", "street", "postal_code", "enrich area codes",
  "address", "latitude", "longitude", "phone", "phone_type", "linkedin", "facebook", "twitter", "instagram", "tiktok",
  "whatsapp", "youtube", "site", "site_generator", "photo", "photos_count", "rating", "rating_history", "reviews", "reviews_link",
  "range", "business_status", "business_status_history", "booking_appointment_link", "menu_link", "verified", "owner_title",
  "located_in", "os_id", "google_id", "place_id", "cid", "gmb_link", "located_os_id", "working_hours", "area_service", "about",
  "corp_name", "corp_employees", "corp_revenue", "corp_founded_year", "corp_is_public", "added_at", "updated_at",
  "email", "email_title", "email_first_name", "email_last_name", "is_email_valid"
]

export async function POST(req: Request) {
  try {
    const { message, rows } = await req.json()

    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn("⚠️ No rows provided")
      return NextResponse.json({ error: "No data to process" }, { status: 400 })
    }

    // Debug: Log sample data
    console.log("📦 Sample rows:", rows.slice(0, 3))

    const { data: settingsRow } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "scraperSettings")
      .maybeSingle()

    const settings = typeof settingsRow?.value === "string"
      ? JSON.parse(settingsRow.value)
      : settingsRow?.value || {}

    const slackBotToken = settings.slackBotToken
    const slackChannelId = settings.slackChannelId

    if (!slackBotToken || !slackChannelId) {
      return NextResponse.json({ error: "Missing Slack credentials" }, { status: 400 })
    }

    // ✅ Proper worksheet creation using the defined headers
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: VERIFIED_HEADERS })
    XLSX.utils.sheet_add_aoa(worksheet, [VERIFIED_HEADERS], { origin: "A1" })

    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Results")
    const xlsxBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" })

    const fileName = `business-verified-clean.xlsx`
    const { error: uploadError } = await supabase
      .storage
      .from("scrapes")
      .upload(fileName, xlsxBuffer, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: true,
      })

    if (uploadError) {
      console.error("❌ Upload failed:", uploadError)
      return NextResponse.json({ error: "Upload failed" }, { status: 500 })
    }

    const { data: publicUrlData } = supabase
      .storage
      .from("scrapes")
      .getPublicUrl(fileName)

    const publicUrl = publicUrlData?.publicUrl

    const res = await axios.post("https://slack.com/api/chat.postMessage", {
      channel: slackChannelId,
      text: `${message}\n\n📎 [Download XLSX](${publicUrl})`,
      mrkdwn: true,
    }, {
      headers: {
        Authorization: `Bearer ${slackBotToken}`,
        "Content-Type": "application/json",
      },
    })

    if (!res.data.ok) {
      console.error("❌ Slack error:", res.data)
      return NextResponse.json({ error: "Slack message failed" }, { status: 500 })
    }

    return NextResponse.json({ success: true, publicUrl })
  } catch (err) {
    console.error("❌ Failed to send Slack message:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
