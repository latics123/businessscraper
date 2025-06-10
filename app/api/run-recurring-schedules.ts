import { supabase } from "@/lib/supabase"
import { fetchBusinessData } from "@/actions/targetron"
import { sendTelegramMessage } from "@/actions/telegram"
import { runScrapePipeline } from "@/lib/runScrapePipeline" // adjust path if needed

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const now = new Date()
  const currentDay = now.toLocaleString("en-US", { weekday: "long" }) // e.g. Monday
  const currentHour = now.getHours()
  const currentMinute = now.getMinutes()

  const { data: schedules, error } = await supabase
    .from("recurring_scrapes")
    .select("*")

  if (error) {
    console.error("❌ Error fetching schedules:", error)
    return res.status(500).json({ error: "Supabase query failed" })
  }

  const due = schedules.filter(s =>
    s.recurring_days?.includes(currentDay) &&
    s.hour === currentHour &&
    s.minute === currentMinute
  )

  for (const schedule of due) {
    try {
// Step 1: Build full formData object
const formData = {
  targetronApiKey: schedule.targetronApiKey,
  country: schedule.country,
  city: schedule.city,
  state: schedule.state,
  postalCode: schedule.postal_code,
  businessType: schedule.business_type,
  businessStatus: schedule.business_status,
  limit: schedule.record_limit,
  skipTimes: schedule.skip_times,
  addedFrom: schedule.from_date || new Date().toISOString().split("T")[0],
  addedTo: schedule.to_date || new Date().toISOString().split("T")[0],
  verifyEmails: true,
  connectEmailVerification: true,
  millionApiKey: schedule.million_api_key,
  phoneFilter: "with_phone",
  enrichWithAreaCodes: false,
  telegramBotToken: schedule.telegramBotToken,
  telegramChatId: schedule.telegramChatId,

  // ✅ Add these for Instantly
  instantlyApiKey: schedule.instantly_api_key,
  instantlyListId: schedule.instantly_list_id,
  instantlyCampaignId: schedule.instantly_campaign_id,
  connectColdEmail: schedule.connect_cold_email,

  // Optional filenames
  jsonFileName: `scrape_${schedule.city}_${schedule.business_type}_${Date.now()}.json`,
  csvFileName: `scrape_${schedule.city}_${schedule.business_type}_${Date.now()}.csv`,
  addtocampaign: schedule.add_to_campaign,
}

// Step 2: Call your unified pipeline
await runScrapePipeline({
  formData,
  downloadFiles: false,
  uploadToInstantlyEnabled: true,
  sendToTelegram: true,
  setBusinessData: () => {},
  toast: () => {},
})
      

      await sendTelegramMessage(
        `✅ Scrape for ${schedule.city}, ${schedule.business_type} ran at ${currentHour}:${currentMinute}. ${results.length} records found.`,
        {
          botToken: schedule.telegramBotToken,
          chatId: schedule.telegramChatId,
        }
      )
    } catch (err) {
      console.error(`❌ Scrape failed for schedule ${schedule.id}`, err)
    }
  }

  return res.status(200).json({ message: "Checked schedules" })
}
