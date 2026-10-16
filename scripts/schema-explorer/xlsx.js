// Minimal, dependency-free .xlsx writer: enough for flat tables with a bold
// frozen header row, auto-filter, column widths, text wrapping and indented
// cells. An .xlsx file is a zip of SpreadsheetML parts; the zip is written by
// hand using Node's built-in deflate and CRC32.

import zlib from 'node:zlib'

const INDENT_LEVELS = 9

// Cell style ids, indexes into cellXfs in styles.xml.
export const STYLE = {
  default: 0,
  header: 1,
  wrap: 2,
  indent: (level) => 3 + Math.min(level, INDENT_LEVELS - 1)
}

// Characters XML 1.0 can carry; anything else (e.g. stray control codes) is dropped.
const isXmlChar = (cp) =>
  cp === 0x9 ||
  cp === 0xa ||
  cp === 0xd ||
  (cp >= 0x20 && cp <= 0xd7ff) ||
  (cp >= 0xe000 && cp <= 0xfffd) ||
  cp >= 0x10000

const escapeXml = (value) =>
  Array.from(String(value))
    .filter((ch) => isXmlChar(ch.codePointAt(0)))
    .join('')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const columnName = (index) => {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  }
  return name
}

// Sheet names: at most 31 characters, none of []:*?/\, unique ignoring case.
const sheetNamer = () => {
  const used = new Set()
  return (wanted) => {
    const base = wanted.replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Sheet'
    let name = base
    for (let i = 2; used.has(name.toLowerCase()); i++) {
      name = `${base.slice(0, 31 - String(i).length - 1)}~${i}`
    }
    used.add(name.toLowerCase())
    return name
  }
}

const stylesXml = () => {
  const indentXfs = Array.from(
    { length: INDENT_LEVELS },
    (_, i) =>
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" indent="${i}"/></xf>`
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCEFE9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${3 + INDENT_LEVELS}">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
${indentXfs}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
}

/**
 * Build the sheet XML for one table.
 * @param {{ columns: { header: string, width?: number, style?: number }[], rows: Array<Array<string|number|{ value: string|number, style: number }|null>> }} sheet
 * @param {(text: string) => number} sharedString
 */
const sheetXml = (sheet, sharedString) => {
  const cell = (value, ref, style) => {
    if (value === null || value === undefined || value === '') {
      return style ? `<c r="${ref}" s="${style}"/>` : ''
    }
    if (typeof value === 'number') {
      return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
    }
    return `<c r="${ref}" s="${style}" t="s"><v>${sharedString(String(value))}</v></c>`
  }
  const lastCol = columnName(sheet.columns.length - 1)
  const header = sheet.columns
    .map((c, i) => cell(c.header, `${columnName(i)}1`, STYLE.header))
    .join('')
  const body = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((v, i) => {
          const ref = `${columnName(i)}${r + 2}`
          if (v && typeof v === 'object') return cell(v.value, ref, v.style)
          return cell(v, ref, sheet.columns[i].style ?? STYLE.default)
        })
        .join('')
      return `<row r="${r + 2}">${cells}</row>`
    })
    .join('')
  const cols = sheet.columns
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.width ?? 16}" customWidth="1"/>`
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData><row r="1">${header}</row>${body}</sheetData>
<autoFilter ref="A1:${lastCol}${sheet.rows.length + 1}"/>
</worksheet>`
}

// Write a zip archive (deflate) from [name, Buffer] entries.
const zip = (entries) => {
  const locals = []
  const centrals = []
  let offset = 0
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const compressed = zlib.deflateRawSync(data)
    const crc = zlib.crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0x21, 12) // date: 1980-01-01
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, nameBuf, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(0, 12)
    central.writeUInt16LE(0x21, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centrals.push(central, nameBuf)

    offset += local.length + nameBuf.length + compressed.length
  }
  const centralBuf = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuf, end])
}

/**
 * Build an .xlsx workbook.
 * @param {{ name: string, columns: object[], rows: Array<Array<unknown>> }[]} sheets
 * @returns {Buffer}
 */
export const writeXlsx = (sheets) => {
  const strings = []
  const stringIndex = new Map()
  const sharedString = (text) => {
    if (!stringIndex.has(text)) {
      stringIndex.set(text, strings.length)
      strings.push(text)
    }
    return stringIndex.get(text)
  }

  const nameFor = sheetNamer()
  const named = sheets.map((s) => ({ ...s, name: nameFor(s.name) }))
  const sheetParts = named.map((s) => sheetXml(s, sharedString))

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${named.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
<definedNames>${named
    .map(
      (s, i) =>
        `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${escapeXml(s.name.replace(/'/g, "''"))}'!$A$1:$${columnName(s.columns.length - 1)}$${s.rows.length + 1}</definedName>`
    )
    .join('')}</definedNames>
</workbook>`

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId${named.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

  // Built last: the sheets above fill the shared string table.
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">${strings
    .map((t) => `<si><t xml:space="preserve">${escapeXml(t)}</t></si>`)
    .join('')}</sst>`

  const parts = [
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRels],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', workbookRels],
    ['xl/styles.xml', stylesXml()],
    ['xl/sharedStrings.xml', sharedStrings],
    ...sheetParts.map((xml, i) => [`xl/worksheets/sheet${i + 1}.xml`, xml])
  ]
  return zip(parts.map(([name, xml]) => [name, Buffer.from(xml, 'utf8')]))
}
