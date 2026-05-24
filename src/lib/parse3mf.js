import JSZip from 'jszip'

// ───────────────────────────────────────────────────────────────
// PUBLIC API
// ───────────────────────────────────────────────────────────────
export async function parse3mf(file) {
  let zip

  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new Error(
      'Cannot open this file. Make sure it is a valid .3mf archive.'
    )
  }

  const allFiles = Object.keys(zip.files).filter(
    k => !zip.files[k].dir
  )

  // ───────────────────────────────────────────────────────────
  // STRATEGY 1 — ANY JSON METADATA FILE
  // ───────────────────────────────────────────────────────────
  const jsonKeys = allFiles
    .filter(f => f.toLowerCase().endsWith('.json'))
    .sort()

  for (const key of jsonKeys) {
    try {
      const raw = await zip.files[key].async('text')

      const result = parsePlateJson(raw)

      if (result) {
        return {
          ...result,
          source: `json:${key}`,
          filename: file.name,
        }
      }
    } catch (err) {
      // Ignore non-matching JSON
    }
  }

  // ───────────────────────────────────────────────────────────
  // STRATEGY 2 — slice_info.config
  // ───────────────────────────────────────────────────────────
  const sliceKey = allFiles.find(f =>
    f.toLowerCase().replace(/\\/g, '/').includes('slice_info')
  )

  if (sliceKey) {
    try {
      const raw = await zip.files[sliceKey].async('text')

      const result =
        parseSliceInfoXml(raw) ??
        parseSliceInfoRegex(raw)

      if (result) {
        return {
          ...result,
          source: 'slice_info',
          filename: file.name,
        }
      }
    } catch { }
  }

  // ───────────────────────────────────────────────────────────
  // STRATEGY 3 — GCODE
  // ───────────────────────────────────────────────────────────
  const gcodeKey = allFiles.find(f => {
    const x = f.toLowerCase()

    return (
      x.endsWith('.gcode') ||
      x.endsWith('.gcode.3mf') ||
      (x.includes('plate_') && x.includes('gcode'))
    )
  })

  if (gcodeKey) {
    try {
      const buf = await zip.files[gcodeKey].async('arraybuffer')

      const header = new TextDecoder(
        'utf-8',
        { fatal: false }
      ).decode(buf.slice(0, 65536))

      const result = parseGcodeHeader(header)

      if (result) {
        return {
          ...result,
          source: 'gcode',
          filename: file.name,
        }
      }
    } catch { }
  }

  // ───────────────────────────────────────────────────────────
  // DIAGNOSTICS
  // ───────────────────────────────────────────────────────────
  let diag = ''

  try {
    const jsonPreview = jsonKeys.slice(0, 5)

    for (const key of jsonPreview) {
      try {
        const raw = await zip.files[key].async('text')
        const data = JSON.parse(raw)

        diag += `\n\n${key} keys:\n`
        diag += Object.keys(data).join(', ')
      } catch { }
    }
  } catch { }

  const topFiles = allFiles
    .slice(0, 20)
    .map(f => `• ${f}`)
    .join('\n')

  throw new Error(
    `No print statistics found in this file.\n\n` +
    `This usually means:\n` +
    `• the project was NOT sliced yet\n` +
    `• or this is a geometry-only 3MF\n\n` +
    `Files inside archive:\n${topFiles}` +
    (allFiles.length > 20
      ? `\n• ...and ${allFiles.length - 20} more`
      : '') +
    diag +
    `\n\nFix:\n` +
    `1. Open in Bambu Studio / OrcaSlicer\n` +
    `2. Click "Slice Plate"\n` +
    `3. Export 3MF again`
  )
}

// ───────────────────────────────────────────────────────────────
// JSON PARSER
// ───────────────────────────────────────────────────────────────
function parsePlateJson(raw) {
  let data

  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }

  if (!data || typeof data !== 'object') {
    return null
  }

  // ───────────────────────────────────────────────────────────
  // FILAMENT GRAMS
  // ───────────────────────────────────────────────────────────
  let gramsArr = null

  const gramsKeys = [
    'filament_used_g',
    'filament_weight',
    'used_g',
    'filament_used_weight',
    'filament_g',
    'filament_weights',

    // newer variants
    'total_filament_g',
    'filament_usage',
    'material_usage',
    'extrusion_weight_g',
  ]

  for (const key of gramsKeys) {
    const v = data[key]

    if (v == null) continue

    const arr = Array.isArray(v)
      ? v.map(x => parseFloat(x) || 0)
      : [parseFloat(v) || 0]

    if (arr.some(x => x > 0)) {
      gramsArr = arr
      break
    }
  }

  // ───────────────────────────────────────────────────────────
  // FILAMENT OBJECT ARRAYS
  // ───────────────────────────────────────────────────────────
  let filamentObjects = null

  const objArrayKeys = [
    'filament',
    'filament_used',
    'filaments',
    'extruder_filaments',
  ]

  for (const key of objArrayKeys) {
    const arr = data[key]

    if (!Array.isArray(arr) || arr.length === 0) {
      continue
    }

    const grams = arr.map(f =>
      parseFloat(
        f.used_g ??
        f.grams ??
        f.weight ??
        f.filament_used_g ??
        f.g ??
        0
      ) || 0
    )

    if (grams.some(x => x > 0)) {
      gramsArr = grams
      filamentObjects = arr
      break
    }
  }

  // ───────────────────────────────────────────────────────────
  // UNSLICED PROJECT DETECTION
  // ───────────────────────────────────────────────────────────
  if (!gramsArr || gramsArr.every(g => g === 0)) {
    if (
      data.bbox_all &&
      data.filament_colors &&
      !data.prediction &&
      !data.print_time
    ) {
      throw new Error(
        'This 3MF project has not been sliced yet.\n\n' +
        'Open it in Bambu Studio and click "Slice Plate" first.'
      )
    }

    return null
  }

  // ───────────────────────────────────────────────────────────
  // METERS
  // ───────────────────────────────────────────────────────────
  let metersArr = null

  if (filamentObjects) {
    metersArr = filamentObjects.map(f =>
      parseFloat(
        f.used_m ??
        f.meters ??
        f.m ??
        0
      ) || 0
    )
  } else {
    for (const key of [
      'filament_used_m',
      'filament_length',
      'used_m',
      'filament_m',
      'filament_lengths',
    ]) {
      const v = data[key]

      if (v == null) continue

      metersArr = Array.isArray(v)
        ? v.map(x => parseFloat(x) || 0)
        : [parseFloat(v) || 0]

      break
    }
  }

  // ───────────────────────────────────────────────────────────
  // COLORS
  // ───────────────────────────────────────────────────────────
  let colorsArr = null

  if (filamentObjects) {
    colorsArr = filamentObjects.map(f =>
      String(f.color ?? f.colour ?? '')
    )
  } else {
    for (const key of [
      'filament_color',
      'filament_colour',
      'filament_colors',
      'filament_colours',
      'colors',
      'colours',
    ]) {
      const v = data[key]

      if (v == null) continue

      colorsArr = Array.isArray(v)
        ? v.map(String)
        : [String(v)]

      break
    }
  }

  // ───────────────────────────────────────────────────────────
  // MATERIALS
  // ───────────────────────────────────────────────────────────
  let typesArr = null

  if (filamentObjects) {
    typesArr = filamentObjects.map(f =>
      String(
        f.type ??
        f.material ??
        'PLA'
      )
    )
  } else {
    for (const key of [
      'filament_type',
      'filament_material',
      'filament_types',
      'filament_materials',
      'materials',
      'types',
    ]) {
      const v = data[key]

      if (v == null) continue

      typesArr = Array.isArray(v)
        ? v.map(String)
        : [String(v)]

      break
    }
  }

  // ───────────────────────────────────────────────────────────
  // PRINT TIME
  // ───────────────────────────────────────────────────────────
  let predSec = 0

  for (const key of [
    'prediction',
    'print_time',
    'estimated_time',
    'total_print_time',
    'gcode_time',
    'estimate_normal_print_time',
  ]) {
    const v = data[key]

    if (v == null) continue

    if (typeof v === 'number' && v > 0) {
      predSec = Math.round(v)
      break
    }

    if (typeof v === 'string' && v !== '') {
      const t = parseTimeString(v)

      predSec = t > 0
        ? t
        : (parseInt(v) || 0)

      if (predSec > 0) break
    }
  }

  // ───────────────────────────────────────────────────────────
  // TOTAL WEIGHT
  // ───────────────────────────────────────────────────────────
  let weight = 0

  for (const key of [
    'weight',
    'total_weight',
    'total_filament_used_g',
    'total_used_g',
    'total_g',
  ]) {
    const v = data[key]

    if (v != null) {
      weight = parseFloat(v) || 0

      if (weight > 0) break
    }
  }

  // ───────────────────────────────────────────────────────────
  // FILAMENT OBJECTS
  // ───────────────────────────────────────────────────────────
  const filaments = gramsArr
    .map((grams, i) => {
      if (grams <= 0) return null

      const rawColor = String(
        colorsArr?.[i] ?? ''
      )
        .toUpperCase()
        .replace(/\s/g, '')
        .replace(/^#/, '')

      const mat = String(
        typesArr?.[i] ?? 'PLA'
      )
        .toUpperCase()
        .trim()

      const isSup =
        mat.includes('SUPPORT') ||
        rawColor.includes('SUPPORT')

      return {
        slot: i + 1,
        color_hex:
          isSup || !rawColor
            ? null
            : `#${rawColor}`,
        material:
          isSup
            ? 'SUPPORT'
            : mat,
        grams,
        meters: metersArr?.[i] ?? 0,
        cm3: 0,
        is_support: isSup,
      }
    })
    .filter(Boolean)

  if (filaments.length === 0) {
    return null
  }

  const plateIdx =
    typeof data.plate_index === 'number'
      ? data.plate_index + 1
      : 1

  return {
    plates: [
      buildPlate(
        plateIdx,
        predSec,
        weight,
        filaments
      ),
    ],
    selected_plate: 0,
  }
}

// ───────────────────────────────────────────────────────────────
// XML PARSER
// ───────────────────────────────────────────────────────────────
function parseSliceInfoXml(xml) {
  try {
    const doc = new DOMParser().parseFromString(
      xml,
      'text/xml'
    )

    if (doc.querySelector('parsererror')) {
      throw new Error()
    }

    const plateTags = doc.querySelectorAll('plate')

    if (plateTags.length === 0) {
      return null
    }

    const plates = []

    plateTags.forEach(plate => {
      const getMeta = key =>
        plate
          .querySelector(`metadata[key="${key}"]`)
          ?.getAttribute('value') ?? null

      const predSec =
        parseInt(getMeta('prediction') ?? '0') || 0

      const weight =
        parseFloat(getMeta('weight') ?? '0') || 0

      const idx =
        parseInt(getMeta('index') ?? '1') ||
        plates.length + 1

      const filaments = []

      plate.querySelectorAll('filament').forEach(f => {
        const grams =
          parseFloat(
            f.getAttribute('used_g') ?? '0'
          ) || 0

        if (grams <= 0) return

        const rawColor =
          (
            f.getAttribute('color') ?? ''
          )
            .toUpperCase()
            .trim()

        const material =
          (
            f.getAttribute('type') ?? 'PLA'
          )
            .toUpperCase()
            .trim()

        const slot =
          parseInt(
            f.getAttribute('id') ?? '0'
          ) || filaments.length + 1

        const isSup =
          material.includes('SUPPORT') ||
          rawColor.includes('SUPPORT')

        filaments.push({
          slot,
          color_hex:
            isSup || !rawColor
              ? null
              : rawColor.startsWith('#')
                ? rawColor
                : `#${rawColor}`,
          material,
          grams,
          meters:
            parseFloat(
              f.getAttribute('used_m') ?? '0'
            ) || 0,
          cm3: 0,
          is_support: isSup,
        })
      })

      if (
        filaments.length === 0 &&
        predSec === 0
      ) {
        return
      }

      plates.push(
        buildPlate(
          idx,
          predSec,
          weight,
          filaments
        )
      )
    })

    return plates.length > 0
      ? {
        plates,
        selected_plate: 0,
      }
      : null
  } catch {
    return null
  }
}

// ───────────────────────────────────────────────────────────────
// REGEX FALLBACK
// ───────────────────────────────────────────────────────────────
function parseSliceInfoRegex(xml) {
  try {
    const predMatch =
      xml.match(
        /key="prediction"\s+value="(\d+)"/
      )

    const weightMatch =
      xml.match(
        /key="weight"\s+value="([0-9.]+)"/
      )

    const filTags = [
      ...xml.matchAll(
        /<filament\b([^>]+)\/>/gi
      ),
    ]

    if (filTags.length === 0) {
      return null
    }

    const getAttr = (s, a) => {
      const m = s.match(
        new RegExp(`${a}="([^"]*)"`, 'i')
      )

      return m?.[1] ?? ''
    }

    const filaments = filTags
      .map((m, i) => {
        const s = m[1]

        const grams =
          parseFloat(
            getAttr(s, 'used_g')
          ) || 0

        if (grams <= 0) return null

        const rawCol =
          getAttr(s, 'color')
            .toUpperCase()

        const mat =
          (
            getAttr(s, 'type') || 'PLA'
          ).toUpperCase()

        const isSup =
          mat.includes('SUPPORT') ||
          rawCol.includes('SUPPORT')

        return {
          slot:
            parseInt(getAttr(s, 'id')) ||
            i + 1,
          color_hex:
            isSup || !rawCol
              ? null
              : rawCol.startsWith('#')
                ? rawCol
                : `#${rawCol}`,
          material: mat,
          grams,
          meters:
            parseFloat(
              getAttr(s, 'used_m')
            ) || 0,
          cm3: 0,
          is_support: isSup,
        }
      })
      .filter(Boolean)

    if (filaments.length === 0) {
      return null
    }

    return {
      plates: [
        buildPlate(
          1,
          predMatch
            ? parseInt(predMatch[1])
            : 0,
          weightMatch
            ? parseFloat(weightMatch[1])
            : 0,
          filaments
        ),
      ],
      selected_plate: 0,
    }
  } catch {
    return null
  }
}

// ───────────────────────────────────────────────────────────────
// GCODE PARSER
// ───────────────────────────────────────────────────────────────
function parseGcodeHeader(text) {
  try {
    const line = p => {
      const m = text.match(p)
      return m?.[1]?.trim() ?? null
    }

    const list = s =>
      s
        ? s.split(',').map(v => v.trim())
        : []

    const grStr = line(
      /filament used \[g\]\s*=\s*(.+)/i
    )

    if (!grStr) {
      return null
    }

    const gramsList = list(grStr)

    const metersList = list(
      line(
        /filament used \[m\]\s*=\s*(.+)/i
      ) ?? ''
    )

    const colorList = list(
      line(
        /filament color\s*=\s*(.+)/i
      ) ?? ''
    )

    const typeList = list(
      line(
        /filament type\s*=\s*(.+)/i
      ) ?? ''
    )

    const timeStr =
      line(
        /estimated printing time.*?=\s*(.+)/i
      ) ??
      line(
        /print time\s*=\s*(.+)/i
      )

    const predSec =
      timeStr
        ? parseTimeString(timeStr)
        : 0

    const filaments = gramsList
      .map((g, i) => {
        const grams =
          parseFloat(g) || 0

        if (grams <= 0) return null

        const rawCol =
          colorList[i] || '888888'

        const mat =
          (
            typeList[i] || 'PLA'
          ).toUpperCase()

        const isSup =
          rawCol
            .toLowerCase()
            .includes('support') ||
          mat.includes('SUPPORT')

        return {
          slot: i + 1,
          color_hex:
            isSup
              ? null
              : `#${rawCol.replace('#', '')}`,
          material: mat,
          grams,
          meters:
            parseFloat(
              metersList[i]
            ) || 0,
          cm3: 0,
          is_support: isSup,
        }
      })
      .filter(Boolean)

    if (filaments.length === 0) {
      return null
    }

    return {
      plates: [
        buildPlate(
          1,
          predSec,
          0,
          filaments
        ),
      ],
      selected_plate: 0,
    }
  } catch {
    return null
  }
}

// ───────────────────────────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────────────────────────
function buildPlate(
  idx,
  predSec,
  weight,
  filaments
) {
  const modelG = filaments
    .filter(f => !f.is_support)
    .reduce((s, f) => s + f.grams, 0)

  const suppG = filaments
    .filter(f => f.is_support)
    .reduce((s, f) => s + f.grams, 0)

  return {
    plate_index: idx,

    print_time_seconds: predSec,

    print_time_hours: parseFloat(
      (predSec / 3600).toFixed(3)
    ),

    print_time_formatted:
      formatSeconds(predSec),

    filaments,

    total_grams: parseFloat(
      (
        weight ||
        modelG + suppG
      ).toFixed(2)
    ),

    model_grams: parseFloat(
      modelG.toFixed(2)
    ),

    support_grams: parseFloat(
      suppG.toFixed(2)
    ),
  }
}

function formatSeconds(s) {
  if (!s) return '—'

  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const x = s % 60

  const p = []

  if (h > 0) p.push(`${h}h`)
  if (m > 0) p.push(`${m}m`)
  if (x > 0 && h < 1) p.push(`${x}s`)

  return p.join(' ') || '< 1m'
}

function parseTimeString(str) {
  let s = 0

  const h = str.match(/(\d+)\s*h/i)
  if (h) s += parseInt(h[1]) * 3600

  const m = str.match(/(\d+)\s*m/i)
  if (m) s += parseInt(m[1]) * 60

  const x = str.match(/(\d+)\s*s/i)
  if (x) s += parseInt(x[1])

  return s
}

// ───────────────────────────────────────────────────────────────
// COST CALCULATOR
// ───────────────────────────────────────────────────────────────
export function calcFilamentCosts(
  filaments,
  filamentPricePerKg
) {
  const rate =
    parseFloat(filamentPricePerKg) || 35

  return filaments.map(f => ({
    ...f,

    cost_tnd: parseFloat(
      (
        (f.grams / 1000) * rate
      ).toFixed(3)
    ),
  }))
}