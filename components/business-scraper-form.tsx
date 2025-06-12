"use client"

import type React from "react"
import * as XLSX from "xlsx"
import { ReactNode, useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { fetchBusinessData } from "@/actions/targetron"
import { verifyEmails } from "@/actions/million-verifier"
import { uploadToInstantly } from "@/actions/instantly"
import { sendTelegramMessage, sendTelegramFile } from "@/actions/telegram"
import { SettingsDialog } from "@/components/settings-dialog"
import { Loader2, Calendar, Settings, Plus, FileJson, FileSpreadsheet, Download, HelpCircle } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { saveSettings, loadSettings } from "@/lib/settings-storage"
import { downloadJsonAsFile, convertJsonToCsv } from "@/lib/utils"
import { loadEnrichAreaCodesFromURL } from "@/lib/utils"
import { supabase } from "@/lib/supabase"
import { fetchRecurringSchedules } from "@/lib/utils" // adjust path
import { useRouter } from "next/navigation"
import { useUser } from "@/lib/useUser"
import { HelpDialog } from "@/components/help-dialog"
import { convertAndVerifyJson } from "@/lib/utils"
import { runScrapePipeline } from "@/lib/runScrapePipeline"
import { DateTime } from "luxon"

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user, loading } = useUser()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
  }, [user, loading, router])

  if (loading || !user) return <p>Loading...</p>

  return <>{children}</>
}

  const [userTimeZone, setUserTimeZone] = useState("Europe/Tirane") // fallback default

// Default form data without date-specific values
const defaultFormData = {
  targetronApiKey: "",
  telegramBotToken: "",
  telegramChatId: "",
  millionApiKey: "",
  instantlyApiKey: "",
  instantlyListId: "",
  instantlyCampaignId: "",
time_zone: userTimeZone,
  // ✅ Add these for profiles
  instProfileId: "",
  instantlyProfiles: [] as {
    name: string
    listId: string
    campaignId: string
  }[],
  tempInstantlyProfileName: "",
  tempInstantlyListId: "",
  tempInstantlyCampaignId: "",

  scrapeType: "profiles",
  fromDate: "",
  toDate: "",
  country: "US",
city: null as string | null,
  state: "NY",
  postalCode: "",
  businessType: "restaurant",
  businessStatus: "operational",
  limit: 10,
  skipTimes: 1,

  phoneFilter: "with_phone",
  phoneNumber: "",
  verifyEmails: true,
  enrichWithAreaCodes: false,

  jsonFileName: "business_data.json",
  csvFileName: "business_data.csv",
  addtocampaign: false,

  connectColdEmail: false,
  connectEmailVerification: true,
}

export function BusinessScraperForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [formData, setFormData] = useState(defaultFormData)
  const [isClient, setIsClient] = useState(false)
  const [businessData, setBusinessData] = useState<any[]>([])
  const [hasData, setHasData] = useState(false)
    const [userTimeZone, setUserTimeZone] = useState("Europe/Tirane") // ✅ correct


  // Set isClient to true when component mounts (client-side only)
useEffect(() => {
  setIsClient(true)

  const today = new Date().toISOString().split("T")[0]
  setFormData((prev) => ({
    ...prev,
    fromDate: today,
    toDate: today,
  }))

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  setUserTimeZone(tz)

  const savedSettings = loadSettings()
  if (savedSettings) {
    setFormData((prev) => ({ ...prev, ...savedSettings }))
  }

  if (formData.enrichWithAreaCodes) {
    loadEnrichAreaCodesFromURL()
      .then(() => console.log("Enrich area codes loaded"))
      .catch((err) => console.error("Failed to load area codes", err))
  }
}, [])


  const handleChange = (field: string, value: any) => {
    setFormData((prev) => {
      const newData = { ...prev, [field]: value }
      // Save settings when they change, but only on client side
      if (isClient) {
        saveSettings(newData)
      }
      return newData
    })
  }
  const handleQueueScrape = async () => {  
    const newJob = {
      created_at: new Date().toISOString(),
      status: "pending",
      record_limit: formData.limit,
      skip_times: formData.skipTimes,
      add_to_campaign: formData.addtocampaign,
      city: formData.city,
      state: formData.state,
      country: formData.country,
      postal_code: formData.postalCode,
      business_type: formData.businessType,
      business_status: formData.businessStatus,
      from_date: formData.fromDate,
      to_date: formData.toDate,
      phone_filter: formData.phoneFilter,
      phone_number: formData.phoneNumber,
      verify_emails: formData.verifyEmails,
      enrich_with_area_codes: formData.enrichWithAreaCodes,
      json_file_name: formData.jsonFileName,
      csv_file_name: formData.csvFileName,
    }
  
    const { error } = await supabase.from("scrape_queue").insert([newJob])
  
    if (error) {
      toast({
        title: "Failed to add scrape job",
        description: error.message,
        variant: "destructive",
      })
      return
    }
  
    toast({
      title: "Scrape job queued",
      description: "Now running scrape...",
      variant: "default",
    })
  
    // 🔁 Start scraping immediately
    document.querySelector("form")?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }))
  }
    



  
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault()
  setIsLoading(true)
  setHasData(false)
if (formData.enrichWithAreaCodes) {
  await loadEnrichAreaCodesFromURL("/enrich-area-codes.xlsx")
}

  await runScrapePipeline({
    formData,
    downloadFiles: true,
    uploadToInstantlyEnabled: true,
    sendToTelegram: true,
    setBusinessData,
    toast,
  })

  setIsLoading(false)
  setHasData(true)
}


  const handleDownloadJson = () => {
    if (businessData.length > 0) {
      downloadJsonAsFile(businessData, formData.jsonFileName)
      toast({
        title: "JSON file saved",
        description: `Data saved as ${formData.jsonFileName}`,
        variant: "success",
      })
    }
  }

  const handleDownloadCsv = () => {
    if (businessData.length > 0) {
      convertJsonToCsv(businessData, formData.csvFileName)
      toast({
        title: "CSV file created",
        description: `Data exported as ${formData.csvFileName}`,
        variant: "success",
      })
    }
  }
  function calculateCost(recordsRequested: number, cumulativeUsage: number = 0): number {
    const tiers: [number, number | null][] = [
      [5000, 19 / 1000],
      [50000, 10 / 1000],
      [500000, 3 / 1000],
      [5000000, 1 / 1000],
      [50000000, 0.3 / 1000],
      [Infinity, null], // Custom tier
    ]

    let cost = 0
    let remaining = recordsRequested

    for (const [limit, rate] of tiers) {
      if (cumulativeUsage >= limit) continue

      const available = limit - cumulativeUsage
      const recordsInTier = Math.min(remaining, available)

      if (rate !== null) {
        cost += recordsInTier * rate
      } else {
        throw new Error("Custom tier pricing not defined")
      }

      cumulativeUsage += recordsInTier
      remaining -= recordsInTier

      if (remaining <= 0) break
    }

    return cost
  }
// 🔁 STATE HOOKS
const [recurringHour, setRecurringHour] = useState("")
const [recurringMinute, setRecurringMinute] = useState("")
const [selectedDays, setSelectedDays] = useState<string[]>([])
const [recurringSchedules, setRecurringSchedules] = useState<any[]>([])
const [useRecurringSettings, setUseRecurringSettings] = useState(false)
const [sortOrder, setSortOrder] = useState<"new" | "old">("new")
const [typeFilter, setTypeFilter] = useState<"all" | "recurring" | "one-time">("all")

// ✅ ADD RECURRING SCHEDULE
const handleAddRecurring = async ({ immediate = false } = {}) => {
    if (formData.enrichWithAreaCodes) {
    await loadEnrichAreaCodesFromURL("/enrich-area-codes.xlsx")
  }

  const totalLimit = formData.limit
  const batchSize = 100
  const batchCount = Math.ceil(totalLimit / batchSize)

  if (immediate || !useRecurringSettings) {
    const dayMap: Record<string, string> = {
      MON: "Monday",
      TUE: "Tuesday",
      WED: "Wednesday",
      THU: "Thursday",
      FRI: "Friday",
      SAT: "Saturday",
      SUN: "Sunday",
    }

const now = DateTime.now().setZone(userTimeZone)
const hour = now.hour
const minute = (now.minute + 1) % 60

    const dayAbbr = now.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()
    const fullDay = dayMap[dayAbbr] || "Monday"

    const newSchedules = []
    for (let i = 0; i < batchCount; i++) {
      newSchedules.push({
        hour,
        minute,
        recurring_days: [fullDay],
        created_at: now.toISOString(),
        record_limit: totalLimit,
        skip_times: i + 1,
        add_to_campaign: formData.addtocampaign,
        city: formData.city,
        state: formData.state,
        country: formData.country,
        postal_code: formData.postalCode,
        business_type: formData.businessType,
        business_status: formData.businessStatus,
        with_phone: formData.phoneFilter === "with_phone" || formData.phoneFilter === "enter_phone",
        without_phone: formData.phoneFilter === "without_phone",
        enrich_with_area_codes: formData.enrichWithAreaCodes,
        phone_filter: formData.phoneFilter,
        start_now: true,
        one_time: true,

          instantly_api_key: formData.instantlyApiKey,
  instantly_list_id: formData.instantlyListId,
  instantly_campaign_id: formData.instantlyCampaignId,
  connect_cold_email: formData.connectColdEmail,

      })
    }

    const { error } = await supabase.from("recurring_scrapes").insert(newSchedules)

    if (error) {
      console.error("❌ Error saving immediate schedule:", error.message || error.details || error)
      toast({
        title: "❌ Error",
        description: "Failed to start scrape immediately.",
        variant: "destructive",
      })
      return
    }

    toast({
      title: "✅ Scrape scheduled",
      description: `Scrape is queued to run in ~1 minute.`,
      variant: "success",
    })

    // ✅ Run the pipeline logic directly (no XLSX download)
    await runScrapePipeline({
      formData,
      downloadFiles: false,
      uploadToInstantlyEnabled: true,
      sendToTelegram: true,
      setBusinessData,
      toast,
    })

    return
  }

  // 🔁 Regular Recurring Logic
  if (!recurringHour || !recurringMinute || selectedDays.length === 0) {
    alert("Please specify hour, minute, and at least one weekday.")
    return
  }

  for (const day of selectedDays) {
    let hour = parseInt(recurringHour)
    let minute = parseInt(recurringMinute)
    let foundFreeSlot = false
    let attempts = 0

    while (!foundFreeSlot && attempts < 60) {
      const { data: conflicts } = await supabase
        .from("recurring_scrapes")
        .select("id")
        .eq("hour", hour)
        .eq("minute", minute)
        .contains("recurring_days", [day])
        .eq("business_type", formData.businessType)
        .eq("business_status", formData.businessStatus)
        .eq("country", formData.country)
        .eq("city", formData.city)
        .eq("state", formData.state)
        .eq("postal_code", formData.postalCode)
        .eq("with_phone", formData.phoneFilter === "with_phone" || formData.phoneFilter === "enter_phone")
        .eq("without_phone", formData.phoneFilter === "without_phone")

      if (!conflicts || conflicts.length === 0) {
        foundFreeSlot = true
        break
      }

      minute += 1
      if (minute >= 60) {
        minute = 0
        hour = (hour + 1) % 24
      }
      attempts++
    }

    if (!foundFreeSlot) {
      toast({
        title: "⛔ Could not find available time",
        description: `No free time found for ${day}.`,
        variant: "destructive",
      })
      continue
    }

    const newSchedules = []
    for (let i = 0; i < batchCount; i++) {
newSchedules.push({
  hour,
  minute,
  recurring_days: [day],
  created_at: new Date().toISOString(),
  record_limit: totalLimit,
  skip_times: i + 1,
  add_to_campaign: formData.addtocampaign,
  city: formData.city,
  state: formData.state,
  country: formData.country,
  postal_code: formData.postalCode,
  business_type: formData.businessType,
  business_status: formData.businessStatus,
  with_phone: formData.phoneFilter === "with_phone" || formData.phoneFilter === "enter_phone",
  without_phone: formData.phoneFilter === "without_phone",
  enrich_with_area_codes: formData.enrichWithAreaCodes,
  phone_filter: formData.phoneFilter,

  // 🟢 Required for Instantly
  instantly_api_key: formData.instantlyApiKey,
  instantly_list_id: formData.instantlyListId,
  instantly_campaign_id: formData.instantlyCampaignId,
  connect_cold_email: formData.connectColdEmail,
})

    }

    const { error } = await supabase.from("recurring_scrapes").insert(newSchedules)

    if (error) {
      console.error("❌ Error saving batch schedules:", error)
      toast({
        title: "❌ Error",
        description: `Failed to save recurring batches for ${day}.`,
        variant: "destructive",
      })
      continue
    }

    // ✅ Run scrape pipeline after each day's schedule is saved (optional: optimize to only run once)
    await runScrapePipeline({
      formData,
      downloadFiles: false,
      uploadToInstantlyEnabled: true,
      sendToTelegram: true,
      setBusinessData,
      toast,
    })
  }

  toast({
    title: "✅ Batches scheduled",
    description: `Recurring batches created successfully.`,
    variant: "success",
  })

  setRecurringHour("")
  setRecurringMinute("")
  setSelectedDays([])

  fetchRecurringSchedules().then(setRecurringSchedules)
}




// 🗑 DELETE
async function handleDeleteRecurring(id: string, source: string) {
  const tableName = source === "recurring" ? "recurring_scrapes" : "scrape_queue"

  const { error } = await supabase.from(tableName).delete().eq("id", id)
  if (error) {
    console.error(`Failed to delete schedule from ${tableName}`, error.message)
    return
  }

  setRecurringSchedules((prev) => prev.filter((entry) => entry.id !== id))
}

// ⏬ FETCH ON LOAD
useEffect(() => {
  fetchRecurringSchedules().then(setRecurringSchedules)
}, [])
const [currentPage, setCurrentPage] = useState(1)
const schedulesPerPage = 10

const calculateNextSkipTime = async (businessType: string): Promise<number> => {
  const { data, error } = await supabase
    .from("recurring_scrapes")
    .select("record_limit")
    .eq("business_type", businessType)

  if (error) {
    console.error("❌ Error fetching scrapes:", error.message)
    return 1
  }

  const totalLimit = data?.reduce((sum, r) => sum + (r.record_limit || 0), 0) || 0
  const skipTime = Math.floor(totalLimit / 100) + 1
  return skipTime
}

const handleTogglePause = async (id: string, currentState: boolean) => {
  const { error } = await supabase
    .from("recurring_scrapes")
    .update({ paused: !currentState })
    .eq("id", id)

  if (error) {
    console.error("Failed to toggle pause state:", error.message)
    toast({
      title: "Error",
      description: "Failed to update pause state.",
      variant: "destructive",
    })
    return
  }

  // Refresh UI
  fetchRecurringSchedules().then(setRecurringSchedules)
}
const [uploadedFile, setUploadedFile] = useState<File | null>(null)
const [emailVerificationResults, setEmailVerificationResults] = useState<{ email: string, is_email_valid: boolean }[]>([])

async function handleEmailFileVerification(file: File) {
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data, { type: "array" })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const json = XLSX.utils.sheet_to_json<{ email: string }>(sheet)

  const emails = json.map(row => row.email).filter(email => typeof email === "string" && email.includes("@"))

  const results: { email: string, is_email_valid: boolean }[] = []
  const apiKey = "awnUgysVJ3yFdgscOGJomZpGa" // Replace with actual key or env var

  for (const email of emails) {
    try {
      const response = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, apiKey }),
      })
            const result = await response.json()
      results.push({
        email,
        is_email_valid: ["ok", "valid"].includes(result.result) && result.quality !== "risky",
      })
    } catch (error) {
      console.error("Verification error for", email, error)
      results.push({ email, is_email_valid: false })
    }
  }

  setEmailVerificationResults(results)
}


  return (
    
    <Card className="shadow-lg border-0">
      
      <CardHeader className="pb-4 border-b">
  <div className="flex justify-between items-center">
    <CardTitle className="text-xl font-semibold">Google My Business Scraper</CardTitle>

    {/* Group buttons on the right */}
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsSettingsOpen(true)}
        className="flex items-center gap-1"
      >
        <Settings className="h-4 w-4" />
        <span>Settings</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsHelpOpen(true)}
        className="flex items-center gap-1"
      >
        <HelpCircle className="h-4 w-4" />
        <span>Help</span>
      </Button>

      <HelpDialog open={isHelpOpen} onOpenChange={setIsHelpOpen} />

      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await supabase.auth.signOut()
          window.location.href = "/login"
        }}
      >
        Logout
      </Button>
    </div>
  </div>
</CardHeader>
      <CardContent className="pt-6">
        <Tabs defaultValue="profiles" onValueChange={(value) => handleChange("scrapeType", value)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profiles">Scrape New Profiles</TabsTrigger>
            <TabsTrigger value="recurring">Recurring Dates</TabsTrigger>
          </TabsList>

          <TabsContent value="profiles">
            <form onSubmit={handleSubmit}>
              <div className="space-y-6">
                {/* Scrape Type Selection */}

                {/* Date Range Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fromDate" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>From Date</span>
                    </Label>
                    <Input
                      id="fromDate"
                      type="date"
                      value={formData.fromDate}
                      onChange={(e) => handleChange("fromDate", e.target.value)}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="toDate" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>To Date</span>
                    </Label>
                    <Input
                      id="toDate"
                      type="date"
                      value={formData.toDate}
                      onChange={(e) => handleChange("toDate", e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>

                {/* Location Information */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select value={formData.country} onValueChange={(value) => handleChange("country", value)}>
                      <SelectTrigger id="country">
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">United States</SelectItem>
                        <SelectItem value="GB">United Kingdom</SelectItem>
                        <SelectItem value="CA">Canada</SelectItem>
                        <SelectItem value="AU">Australia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                  <Input
  id="city"
  value={formData.city ?? ""}
  onChange={(e) => handleChange("city", e.target.value)}
  placeholder="e.g. New York"
/>

                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => handleChange("state", e.target.value)}
                      placeholder="e.g. NY"
                    // no `required` attribute here
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Postal Code</Label>
                    <Input
                      id="postalCode"
                      value={formData.postalCode}
                      onChange={(e) => handleChange("postalCode", e.target.value)}
                      placeholder="e.g. 10001"
                    // no `required` attribute here either
                    />
                  </div>
                </div>

                {/* Business Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessType">Business Type</Label>
                    <Input
                      id="businessType"
                      value={formData.businessType}
                      onChange={(e) => handleChange("businessType", e.target.value)}
                      placeholder="e.g. restaurant, hotel, retail"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="businessStatus">Business Status</Label>
                    <Select
                      value={formData.businessStatus}
                      onValueChange={(value) => handleChange("businessStatus", value)}
                    >
                      <SelectTrigger id="businessStatus">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="operational">Operational</SelectItem>
                        <SelectItem value="closed_temporarily">Temporarily Closed</SelectItem>
                        <SelectItem value="closed_permanently">Permanently Closed</SelectItem>
                        <SelectItem value="closed_temporarily,operational">Operational + Temporarily Closed</SelectItem>
                        <SelectItem value="closed_temporarily,operational,closed_permanently">All Statuses</SelectItem>
                        </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* API Request Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                  <Label htmlFor="limit">Limit per Request</Label>
                  <Input
  id="limit"
  type="number"
  value={formData.limit ?? ""}
  onChange={(e) => {
    const val = e.target.value
    handleChange("limit", val === "" ? null : parseInt(val))
  }}
  min={1}
max={useRecurringSettings ? 1000 : 5}
/>


                    <p className="text-xs text-gray-500">Number of records per API request</p>
                    <p className="text-xs text-red-500">Note that there is a 50K Limit to this</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="skipTimes">Skip Times</Label>
                    <Input
  id="skipTimes"
  type="number"
  value={formData.skipTimes ?? ""}
  onChange={(e) => {
    const val = e.target.value;
    handleChange("skipTimes", val === "" ? null : Number.parseInt(val));
  }}
  min={1}
/>
                    <p className="text-xs text-gray-500">Number of pagination requests</p>
                  </div>
                </div>

                {/* Phone Filter */}
                <div className="space-y-2">
                  <Label htmlFor="phoneFilter">Phone Filter</Label>
                  <Select
                    value={formData.phoneFilter}
                    onValueChange={(value) => handleChange("phoneFilter", value)}
                  >
                    <SelectTrigger id="phoneFilter">
                      <SelectValue placeholder="Select phone filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="with_phone">With Phone Only</SelectItem>
                      <SelectItem value="without_phone">Without Phone Only</SelectItem>
                      <SelectItem value="enter_phone">Enter Specific Phone Number</SelectItem>
                    </SelectContent>
                  </Select>

                  {formData.phoneFilter === "enter_phone" && (
                    <div className="pt-2">
                      <Label htmlFor="phoneNumber">Phone Number</Label>
                      <input
                        type="text"
                        id="phoneNumber"
                        className="w-full px-3 py-2 border rounded"
                        placeholder="Enter phone number"
                        value={formData.phoneNumber || ""}
                        onChange={(e) => handleChange("phoneNumber", e.target.value)}
                      />
                    </div>
                  )}
                </div>

                {/* Enrich With Area Codes */}
                <div className="border rounded-md p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="enrichWithAreaCodes"
                      checked={formData.enrichWithAreaCodes}
                      onCheckedChange={(checked) => {
                        if (typeof checked === "boolean") {
                          handleChange("enrichWithAreaCodes", checked)
                        }
                      }}
                    />
                    <Label htmlFor="enrichWithAreaCodes" className="cursor-pointer">
                      Enrich With Area Codes
                    </Label>
                  </div>
                </div>

                {/* Output File Names */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="jsonFileName" className="flex items-center gap-2">
                      <FileJson className="h-4 w-4" />
                      JSON File Name
                    </Label>
                    <Input
                      id="jsonFileName"
                      value={formData.jsonFileName}
                      onChange={(e) => handleChange("jsonFileName", e.target.value)}
                      placeholder="e.g. business_data.json"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="csvFileName" className="flex items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4" />
                      CSV File Name
                    </Label>
                    <Input
                      id="csvFileName"
                      value={formData.csvFileName}
                      onChange={(e) => handleChange("csvFileName", e.target.value)}
                      placeholder="e.g. business_data.csv"
                    />
                  </div>
                </div>

                {/* Campaign Option - Fixed to prevent event propagation issues */}
                <div className="border rounded-md p-4 hover:bg-gray-50 transition-colors">
  <div className="flex items-center space-x-2">
    <Checkbox
      id="addtocampaign"
      checked={formData.addtocampaign}
onCheckedChange={(checked) => {
  if (typeof checked === "boolean") {
    handleChange("addtocampaign", checked)
    if (!checked) {
      handleChange("instantlyListId", "")
      handleChange("instantlyCampaignId", "")
      handleChange("instProfileId", "")
    }
  }
}}
    />
    <Label htmlFor="addtocampaign" className="cursor-pointer flex items-center gap-2">
      <Plus className="h-4 w-4" />
      Add to Instantly campaign
    </Label>
  </div>

  {formData.addtocampaign && (
    <div className="mt-4">
      <Label htmlFor="instantlyProfile">Select Instantly Profile</Label>
      <Select
        value={formData.instProfileId || ""}
        onValueChange={(value) => {
          const selected = formData.instantlyProfiles?.find((p) => p.name === value)
          if (selected) {
            handleChange("instantlyListId", selected.listId)
            handleChange("instantlyCampaignId", selected.campaignId)
            handleChange("instProfileId", value)
          }
        }}
      >
        <SelectTrigger id="instantlyProfile">
          <SelectValue placeholder="Choose a saved Instantly profile" />
        </SelectTrigger>
        <SelectContent>
          {(formData.instantlyProfiles || []).map((profile) => (
            <SelectItem key={profile.name} value={profile.name}>
              {profile.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )}
</div>


                <div className="bg-gray-50 p-4 rounded-md space-y-4">
  <div className="flex items-center space-x-2">
    <Checkbox
      id="useRecurringSettings"
      checked={useRecurringSettings}
      onCheckedChange={(checked) => {
        if (typeof checked === "boolean") setUseRecurringSettings(checked);
      }}
    />
    <Label htmlFor="useRecurringSettings" className="cursor-pointer">
      Enable Recurring Settings
    </Label>
  </div>

  {useRecurringSettings && (
  <>
    <h3 className="text-sm font-medium">Recurring settings</h3>

    <div className="space-y-2">
      <Label>Select Days of the Week</Label>

      {/* Everyday checkbox */}
      <div className="flex items-center space-x-2 mb-2">
        <Checkbox
          id="everyday"
          checked={selectedDays.length === 7}
          onCheckedChange={(checked) => {
            if (checked) {
              setSelectedDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
            } else {
              setSelectedDays([]);
            }
          }}
        />
        <Label htmlFor="everyday" className="cursor-pointer">Everyday</Label>
      </div>

      {/* Individual day checkboxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => (
          <label key={day} className="flex items-center space-x-2">
            <Checkbox
              checked={selectedDays.includes(day)}
              onCheckedChange={(checked) => {
                if (checked) {
                  setSelectedDays((prev) => [...prev, day])
                } else {
                  setSelectedDays((prev) => prev.filter((d) => d !== day))
                }
              }}
            />
            <span>{day}</span>
          </label>
        ))}
      </div>
    </div>

    {/* Hour & Minute Inputs */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1">
        <Label>Hour</Label>
        <Input
          type="number"
          min="0"
          max="23"
          value={recurringHour}
          onChange={(e) => setRecurringHour(e.target.value)}
          placeholder="e.g. 13 for 1 PM"
        />
      </div>
      <div className="space-y-1">
        <Label>Minute</Label>
        <Input
          type="number"
          min="0"
          max="59"
          value={recurringMinute}
          onChange={(e) => setRecurringMinute(e.target.value)}
          placeholder="e.g. 30"
        />
      </div>
    </div>
  </>
)}
</div>


                {/* Current Settings Summary */}
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="text-sm font-medium mb-2">Current Settings</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {formData.city}, {formData.state}
                    </Badge>
                    {formData.postalCode && <Badge variant="outline">Postal: {formData.postalCode}</Badge>}
                    <Badge variant="outline">{formData.businessType}</Badge>
                    <Badge variant="outline">Status: {formData.businessStatus}</Badge>
                    <Badge variant="outline">Limit: {formData.limit}</Badge>
                    <Badge variant="outline">Skip: {formData.skipTimes}</Badge>
                    <Badge variant="outline">Phone: {formData.phoneFilter}</Badge>
                    {formData.enrichWithAreaCodes && <Badge variant="outline">Area Codes: Enabled</Badge>}
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Estimated Cost: ${calculateCost(formData.limit * formData.skipTimes).toFixed(2)}
                </p>

                {/* Submit Button */}
                <Button
  type="button"
  onClick={() => {
    console.log("🔍 Scrape form submitted with data:", formData)
    handleAddRecurring({ immediate: !useRecurringSettings })
  }}
  disabled={useRecurringSettings && isLoading}
  className="w-full"
>
  {isLoading && useRecurringSettings ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Scheduling...
    </>
  ) : (
    useRecurringSettings ? "Start Timed Scraping" : "Start Scraping"
  )}
</Button>

{/* <div className="border-t mt-10 pt-6">
  <h3 className="text-lg font-semibold mb-4">Email Verifier</h3>
  <input
    type="file"
    accept=".xlsx"
    onChange={(e) => {
      const file = e.target.files?.[0] || null
      setUploadedFile(file)
      if (file) handleEmailFileVerification(file)
    }}
    className="mb-4"
  />

  {emailVerificationResults.length > 0 && (
    <div className="overflow-auto max-h-96 border rounded-md">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">Is Valid</th>
          </tr>
        </thead>
        <tbody>
          {emailVerificationResults.map(({ email, is_email_valid }, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{email}</td>
              <td className="p-2">{is_email_valid ? "✅ Yes" : "❌ No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}
</div> */}


                {/* Download Buttons - Only show if data is available */}
              </div>
            </form>
          </TabsContent>
          <TabsContent value="recurring">
  <div className="space-y-4">
    <h3 className="text-lg font-medium">Scheduled Scrapes</h3>

    {/* Filters */}
    <div className="flex items-center justify-between px-2">
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Sort:</label>
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as "new" | "old")}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="new">Newest First</option>
            <option value="old">Oldest First</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Show:</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | "recurring" | "one-time")}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="all">All</option>
            <option value="recurring">Recurring Only</option>
            <option value="one-time">One-Time Only</option>
          </select>
        </div>
      </div>
    </div>
  </div>

  {recurringSchedules.length === 0 ? (
    <p className="text-sm text-muted-foreground px-4">No schedules found.</p>
  ) : (
    <>
      <div className="overflow-auto border rounded-md mt-4">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Time</th>
              <th className="px-4 py-2 text-left font-medium">Day</th>
              <th className="px-4 py-2 text-left font-medium">City</th>
              <th className="px-4 py-2 text-left font-medium">Type</th>
              <th className="px-4 py-2 text-left font-medium">Limit</th>
              <th className="px-4 py-2 text-left font-medium">Skip Times</th>
              <th className="px-4 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {recurringSchedules
              .filter((s) => {
if (typeFilter === "recurring") return !s.one_time
if (typeFilter === "one-time") return s.one_time
                return true
              })
              .sort((a, b) => {
                const dateA = new Date(a.created_at || a.date || "").getTime()
                const dateB = new Date(b.created_at || b.date || "").getTime()
                return sortOrder === "new" ? dateB - dateA : dateA - dateB
              })
              .slice((currentPage - 1) * schedulesPerPage, currentPage * schedulesPerPage)
              .map((schedule) => (
                <tr key={schedule.id}>
                  <td className="px-4 py-2">{schedule.date || "-"}</td>
                  <td className="px-4 py-2">
                    {schedule.hour !== null && schedule.minute !== null
                      ? `${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`
                      : "-"}
                  </td>
                  <td className="px-4 py-2">
                    {schedule.recurring_days?.length > 0
                      ? schedule.recurring_days.join(", ")
                      : "-"}
                  </td>
                  <td className="px-4 py-2">{schedule.city || "-"}</td>
                  <td className="px-4 py-2">{schedule.business_type || "-"}</td>
                  <td className="px-4 py-2">{schedule.record_limit ?? "-"}</td>
                  <td className="px-4 py-2">{schedule.skip_times ?? "-"}</td>
                  <td className="px-4 py-2">
                    <Button
  variant={schedule.paused ? "default" : "secondary"}
  size="sm"
  onClick={() => handleTogglePause(schedule.id, schedule.paused)}
  className="px-2 py-1 mr-2"
>
  {schedule.paused ? "Start" : "Pause"}
</Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteRecurring(schedule.id, schedule.source)}
                      className="px-2 py-1"
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 px-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage === 1}
        >
          Previous
        </Button>
        <span className="text-sm">
          Page {currentPage} of {Math.ceil(recurringSchedules.length / schedulesPerPage)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setCurrentPage((prev) =>
              prev < Math.ceil(recurringSchedules.length / schedulesPerPage) ? prev + 1 : prev
            )
          }
          disabled={currentPage === Math.ceil(recurringSchedules.length / schedulesPerPage)}
        >
          Next
        </Button>
      </div>
    </>
  )}
</TabsContent>

        </Tabs>
      </CardContent>
      {isClient && (
        <SettingsDialog
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
          formData={formData}
          onFormDataChange={setFormData}
        />
      )}
    </Card>

  )
}


