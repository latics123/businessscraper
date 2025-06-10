import * as fs from "fs"
import * as path from "path"
import * as XLSX from "xlsx"

export default function handler(req, res) {
  try {
    const filePath = path.resolve("./public/enrich-area-codes.xlsx")
    const arrayBuffer = fs.readFileSync(filePath)
    const workbook = XLSX.read(arrayBuffer, { type: "buffer" })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet)

    const areaCodeMap = {}
    rows.forEach(row => {
      const prefix = String(row["postcode"] || "").split(" ")[0].trim().toUpperCase()
      const code = String(row["telephone area code"] || "").trim()
      if (prefix && code) areaCodeMap[prefix] = code
    })

    res.status(200).json(areaCodeMap)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Failed to load area codes" })
  }
}
