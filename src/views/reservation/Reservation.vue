<script setup>
import { onMounted, onUnmounted, ref, computed, nextTick } from 'vue'
import jsQR from 'jsqr'
import { useToast } from 'primevue'
import { supabase } from '../../plugins/supabaseClient'
import { formatCurrency } from '../../composables/formater'

const toast = useToast()

const selectedDate = ref(new Date())
const venues       = ref([])
const allBookings  = ref([])
const isLoading    = ref(false)
const isUpdating   = ref({})

// ── Scanner state ──────────────────────────────────────────────
const showScanner      = ref(false)
const scanResult       = ref('')
const scanError        = ref('')
const isProcessingScan = ref(false)
const manualUrl        = ref('')
const cameraReady      = ref(false)

// videoRef adalah getter langsung ke elemen — tidak pakai ref() dari template
// karena Dialog PrimeVue teleport menyebabkan ref tidak ter-assign
let videoEl   = null   // HTMLVideoElement — di-set manual via callback
let scanStream = null
let scanInterval = null

// ── Helpers ────────────────────────────────────────────────────
const toDateStr = (d) => {
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const formattedDate = computed(() =>
  selectedDate.value.toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
)
const dateStr = computed(() => toDateStr(selectedDate.value))

// Bandingkan hanya YYYY-MM-DD (tanggal DB: "2026-02-08T17:00:00")
const isSameDate = (tanggal, target) => tanggal?.slice(0, 10) === target

// ── Computed: group per venue ──────────────────────────────────
const bookingsByVenue = computed(() => {
  return venues.value.map(venue => {
    const vBookings = allBookings.value.filter(b => b.bo_venue_id === venue.id)
    const lines = []
    vBookings.forEach(b => (b.lines || []).forEach(l => lines.push(l)))
    lines.sort((a, b) => (a.bo_slot?.start_time || '').localeCompare(b.bo_slot?.start_time || ''))
    return {
      venue,
      bookings: vBookings,
      lines,
      totalReserved: lines.filter(l => l.reservation).length,
      totalPending:  lines.filter(l => !l.reservation).length,
    }
  }).filter(v => v.lines.length > 0)
})

const totalLineCount = computed(() => bookingsByVenue.value.reduce((s, v) => s + v.lines.length, 0))
const totalCheckin   = computed(() => bookingsByVenue.value.reduce((s, v) => s + v.totalReserved, 0))
const totalPending   = computed(() => bookingsByVenue.value.reduce((s, v) => s + v.totalPending, 0))

// ── Load data ──────────────────────────────────────────────────
const loadVenues = async () => {
  const { data } = await supabase
    .from('bo_venue')
    .select('id, name, category')
    .eq('isactive', true)
    .order('seqno', { ascending: true })
  venues.value = data || []
}

const loadBookings = async () => {
  isLoading.value = true
  allBookings.value = []
  try {
    const { data, error } = await supabase
      .from('bo_booking')
      .select(`
        id, skey, grandtotal, status, bo_venue_id,
        bo_user (name, email, phone, companyname),
        bo_bookingline (
          id, tanggal, price, reservation,
          bo_slot (id, name, start_time, end_time)
        ),
        bo_bookingline_jogging (
          id, tanggal, price, reservation,
          jumlah_orang, harga_per_orang,
          bo_slot (id, name, start_time, end_time)
        )
      `)
      .eq('status', 'CO')
      .eq('isactive', true)

    if (error) throw error

    const result = []
    for (const booking of (data || [])) {
      const regularLines = (booking.bo_bookingline || [])
        .filter(l => isSameDate(l.tanggal, dateStr.value))
        .map(l => ({ ...l, _type: 'regular', _booking_id: booking.id, _key: `r-${l.id}` }))

      const joggingLines = (booking.bo_bookingline_jogging || [])
        .filter(l => isSameDate(l.tanggal, dateStr.value))
        .map(l => ({ ...l, _type: 'jogging', _booking_id: booking.id, _key: `j-${l.id}` }))

      const lines = [...regularLines, ...joggingLines]
      if (lines.length === 0) continue
      result.push({ ...booking, lines })
    }
    allBookings.value = result
  } catch (err) {
    console.error(err)
    toast.add({ severity: 'error', summary: 'Error', detail: 'Gagal memuat reservasi: ' + err.message, life: 4000 })
  } finally {
    isLoading.value = false
  }
}

const onDateChange = () => loadBookings()

// ── Toggle reservation ─────────────────────────────────────────
const toggleReservation = async (line) => {
  if (isUpdating.value[line._key]) return
  isUpdating.value[line._key] = true
  const table  = line._type === 'jogging' ? 'bo_bookingline_jogging' : 'bo_bookingline'
  const newVal = !line.reservation
  try {
    const { error } = await supabase.from(table).update({ reservation: newVal }).eq('id', line.id)
    if (error) throw error
    line.reservation = newVal
    toast.add({
      severity: newVal ? 'success' : 'warn',
      summary: newVal ? 'Check-in ✓' : 'Dibatalkan',
      detail: `${line.bo_slot?.start_time} – ${line.bo_slot?.end_time}`,
      life: 2000
    })
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: err.message, life: 3000 })
  } finally {
    isUpdating.value[line._key] = false
  }
}

const checkInAll = async (venueGroup) => {
  for (const line of venueGroup.lines.filter(l => !l.reservation)) {
    await toggleReservation(line)
  }
}

// ── Proses scan QR ────────────────────────────────────────────
// QR berisi: https://booking.sck2.id/bookinginfo/{bo_booking.id}
// RLS memblokir SELECT dari bo_bookingline, tapi UPDATE diizinkan.
// Jadi: langsung UPDATE by bo_booking_id + tanggal, tanpa SELECT dulu.
const processScan = async (raw) => {
  if (isProcessingScan.value) return
  isProcessingScan.value = true
  stopDecoding()

  try {
    // 1. Ekstrak UUID dari URL
    let bookingId = raw.trim()
    try {
      const url   = new URL(raw.trim())
      const parts = url.pathname.split('/').filter(Boolean)
      bookingId   = parts[parts.length - 1]
    } catch { /* bukan URL, pakai raw langsung */ }

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)
    if (!isUUID) {
      const bySkey = allBookings.value.find(b => b.skey === bookingId)
      if (bySkey) bookingId = bySkey.id
      else {
        scanError.value  = `Format QR tidak dikenali: "${bookingId.slice(0, 40)}"`
        scanResult.value = ''
        isProcessingScan.value = false
        return
      }
    }

    const tanggal = dateStr.value  // "YYYY-MM-DD"

    // 2. Ambil nama customer dari allBookings (sudah di memori) atau dari DB
    let customerName = 'Customer'
    let slotCount    = 0
    const localBooking = allBookings.value.find(b => b.id === bookingId)

    if (localBooking) {
      customerName = localBooking.bo_user?.name || 'Customer'
      // Cek apakah semua sudah check-in dari local state
      const todayLines = localBooking.lines || []
      const alreadyAll = todayLines.length > 0 && todayLines.every(l => l.reservation)
      if (alreadyAll) {
        scanResult.value = `✅ ${customerName} sudah check-in sebelumnya`
        scanError.value  = ''
        isProcessingScan.value = false
        return
      }
      slotCount = todayLines.filter(l => !l.reservation).length
    } else {
      // Booking tidak di list hari ini — fetch nama saja dari bo_booking
      const { data: bData } = await supabase
        .from('bo_booking')
        .select('bo_user(name)')
        .eq('id', bookingId)
        .single()
      customerName = bData?.bo_user?.name || 'Customer'
    }

    // 3. Langsung UPDATE reservation = true by bo_booking_id + range tanggal
    //    Tidak perlu SELECT dulu — RLS mungkin blokir SELECT tapi izinkan UPDATE
    const dateStart = tanggal + 'T00:00:00'
    const dateEnd   = tanggal + 'T23:59:59'

    const [upRegular, upJogging] = await Promise.all([
      supabase.from('bo_bookingline')
        .update({ reservation: true })
        .eq('bo_booking_id', bookingId)
        .gte('tanggal', dateStart)
        .lte('tanggal', dateEnd)
        .eq('reservation', false),

      supabase.from('bo_bookingline_jogging')
        .update({ reservation: true })
        .eq('bo_booking_id', bookingId)
        .gte('tanggal', dateStart)
        .lte('tanggal', dateEnd)
        .eq('reservation', false)
    ])

    if (upRegular.error || upJogging.error) {
      const msg = upRegular.error?.message || upJogging.error?.message || 'Unknown error'
      scanError.value  = 'Gagal update: ' + msg
      scanResult.value = ''
      isProcessingScan.value = false
      return
    }

    // 4. Update local state agar tombol di list ikut hijau tanpa reload
    if (localBooking) {
      localBooking.lines.forEach(l => { l.reservation = true })
    }

    scanResult.value = `✅ Check-in berhasil! ${customerName}${slotCount ? ` — ${slotCount} slot dikonfirmasi` : ''}`
    scanError.value  = ''
    toast.add({ severity: 'success', summary: 'Check-in via QR', detail: customerName, life: 4000 })

  } catch (err) {
    scanError.value  = 'Error: ' + err.message
    scanResult.value = ''
  }

  isProcessingScan.value = false
}

// ── Kamera ─────────────────────────────────────────────────────
// Kunci: dapatkan <video> element langsung dari DOM, bukan dari Vue template ref
// karena PrimeVue Dialog memakai Teleport sehingga template ref bisa null
const getVideoEl = () => document.getElementById('scanner-video')

const startCamera = async () => {
  cameraReady.value = false
  scanError.value   = ''
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },  // kamera belakang
        width:  { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    })

    // Polling sampai elemen video ada di DOM (dialog mungkin belum render)
    let tries = 0
    const attach = () => {
      videoEl = getVideoEl()
      if (videoEl) {
        videoEl.srcObject = scanStream
        videoEl.onloadedmetadata = () => {
          videoEl.play()
            .then(() => {
              cameraReady.value = true
              startDecoding()
            })
            .catch(e => { scanError.value = 'Gagal play video: ' + e.message })
        }
      } else if (tries++ < 20) {
        setTimeout(attach, 150)
      } else {
        scanError.value = 'Elemen video tidak ditemukan. Coba tutup dan buka ulang.'
      }
    }
    attach()
  } catch (err) {
    let msg = err.message
    if (err.name === 'NotAllowedError')  msg = 'Izin kamera ditolak. Buka Pengaturan > Izin Kamera untuk browser ini.'
    if (err.name === 'NotFoundError')    msg = 'Kamera tidak ditemukan di perangkat ini.'
    if (err.name === 'NotReadableError') msg = 'Kamera sedang dipakai aplikasi lain.'
    scanError.value = msg
  }
}

const stopCamera = () => {
  stopDecoding()
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop())
    scanStream = null
  }
  if (videoEl) {
    videoEl.srcObject = null
    videoEl = null
  }
  cameraReady.value = false
}

// ── Decode QR — BarcodeDetector (Chrome/Edge) atau jsQR npm package ──
const startDecoding = () => {
  const canvas = document.createElement('canvas')
  const ctx    = canvas.getContext('2d')
  let   nativeDetector = null

  if ('BarcodeDetector' in window) {
    nativeDetector = new window.BarcodeDetector({
      formats: ['qr_code', 'code_128', 'ean_13', 'data_matrix']
    })
  }

  scanInterval = setInterval(async () => {
    if (!videoEl || isProcessingScan.value) return
    if (videoEl.readyState < 2 || videoEl.paused) return
    canvas.width  = videoEl.videoWidth
    canvas.height = videoEl.videoHeight
    if (!canvas.width) return
    ctx.drawImage(videoEl, 0, 0)

    try {
      if (nativeDetector) {
        // Native path — Chrome/Edge Android
        const codes = await nativeDetector.detect(canvas)
        if (codes.length > 0) await processScan(codes[0].rawValue)
      } else {
        // jsQR path — Firefox, Safari, semua browser (import dari npm)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert'
        })
        if (code?.data) await processScan(code.data)
      }
    } catch (_) { /* frame skip */ }
  }, 300)
}

const stopDecoding = () => {
  if (scanInterval) { clearInterval(scanInterval); scanInterval = null }
}

// ── Buka / Tutup Scanner ──────────────────────────────────────
const openScanner = async () => {
  scanResult.value = ''
  scanError.value  = ''
  manualUrl.value  = ''
  isProcessingScan.value = false
  showScanner.value = true
  // Tunggu DOM modal render, lalu start kamera
  await nextTick()
  await new Promise(r => setTimeout(r, 200))
  await startCamera()
}

const closeScanner = () => {
  stopCamera()
  showScanner.value = false
  scanResult.value  = ''
  scanError.value   = ''
  isProcessingScan.value = false
}

const scanAgain = async () => {
  scanResult.value = ''
  scanError.value  = ''
  isProcessingScan.value = false
  await startCamera()
}

const handleManualInput = async () => {
  if (!manualUrl.value.trim()) return
  const val = manualUrl.value.trim()
  manualUrl.value = ''
  await processScan(val)
}

// ── Lifecycle ─────────────────────────────────────────────────
onMounted(async () => {
  await loadVenues()
  await loadBookings()
})

onUnmounted(() => {
  stopCamera()
})
</script>

<template>
  <div class="min-h-screen bg-gray-50">

    <!-- ══ HEADER ══ -->
    <div class="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 class="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <i class="pi pi-id-card text-purple-600 text-2xl"></i>
            Reservasi
          </h1>
          <p class="text-sm text-gray-500 mt-0.5">{{ formattedDate }}</p>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <DatePicker
            v-model="selectedDate"
            dateFormat="dd/mm/yy"
            :showIcon="true"
            @date-select="onDateChange"
            class="w-48"
          />
          <Button icon="pi pi-qrcode" label="Scan QR" severity="primary" @click="openScanner" />
          <Button
            icon="pi pi-refresh"
            variant="outlined"
            severity="secondary"
            :loading="isLoading"
            @click="loadBookings"

          />
        </div>
      </div>

      <!-- Stats -->
      <div class="flex flex-wrap gap-2 mt-3">
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-full text-sm">
          <i class="pi pi-building text-purple-600 text-xs"></i>
          <span class="font-semibold text-purple-800">{{ bookingsByVenue.length }} Venue</span>
        </div>
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm">
          <i class="pi pi-list text-blue-600 text-xs"></i>
          <span class="font-semibold text-blue-800">{{ totalLineCount }} Slot</span>
        </div>
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-sm">
          <i class="pi pi-check-circle text-green-600 text-xs"></i>
          <span class="font-semibold text-green-800">{{ totalCheckin }} Check-in</span>
        </div>
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-full text-sm">
          <i class="pi pi-clock text-yellow-600 text-xs"></i>
          <span class="font-semibold text-yellow-800">{{ totalPending }} Menunggu</span>
        </div>
      </div>
    </div>

    <!-- ══ BODY ══ -->
    <div class="p-4 sm:p-6">

      <!-- Loading skeleton -->
      <div v-if="isLoading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
          <div class="h-5 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div class="space-y-3">
            <div class="h-14 bg-gray-100 rounded-lg"></div>
            <div class="h-14 bg-gray-100 rounded-lg"></div>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="bookingsByVenue.length === 0"
        class="flex flex-col items-center justify-center py-24 text-gray-400">
        <i class="pi pi-calendar-times text-6xl mb-4"></i>
        <p class="text-lg font-semibold">Tidak ada booking CO</p>
        <p class="text-sm mt-1">Belum ada booking Confirmed untuk tanggal ini</p>
      </div>

      <!-- Venue cards -->
      <div v-else class="space-y-6">
        <div v-for="venueGroup in bookingsByVenue" :key="venueGroup.venue.id"
          class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

          <!-- Venue header -->
          <div class="bg-gradient-to-r from-[#0A0E4F] to-[#5B21B6] px-5 py-4
                      flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div class="flex items-center gap-3 text-white">
              <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
                <i class="pi pi-building text-lg"></i>
              </div>
              <div>
                <div class="font-bold text-lg leading-tight">{{ venueGroup.venue.name }}</div>
                <div class="text-purple-200 text-sm flex items-center gap-3 mt-0.5">
                  <span>{{ venueGroup.bookings.length }} pesanan</span>
                  <span>·</span>
                  <span class="text-green-300 font-semibold">{{ venueGroup.totalReserved }} check-in</span>
                  <span>·</span>
                  <span class="text-yellow-300 font-semibold">{{ venueGroup.totalPending }} menunggu</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <div class="hidden sm:block w-32">
                <div class="text-xs text-purple-200 text-right mb-1">
                  {{ venueGroup.totalReserved }}/{{ venueGroup.lines.length }}
                </div>
                <div class="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div class="h-full bg-green-400 rounded-full transition-all duration-500"
                    :style="{ width: `${venueGroup.lines.length
                      ? venueGroup.totalReserved / venueGroup.lines.length * 100 : 0}%` }">
                  </div>
                </div>
              </div>
              <Button v-if="venueGroup.totalPending > 0"
                label="Check-in Semua" icon="pi pi-check-circle"
                severity="success" size="small" @click="checkInAll(venueGroup)" />
              <div v-else
                class="flex items-center gap-1.5 px-3 py-1.5 bg-green-500 rounded-lg text-white text-sm font-bold">
                <i class="pi pi-verified"></i><span>Semua Hadir</span>
              </div>
            </div>
          </div>

          <!-- Bookings -->
          <div class="divide-y divide-gray-100">
            <template v-for="booking in venueGroup.bookings" :key="booking.id">

              <!-- Customer header -->
              <div class="px-5 py-3 bg-gray-50 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <div class="flex items-center gap-2 text-sm flex-wrap">
                  <i class="pi pi-user text-purple-500"></i>
                  <span class="font-semibold text-gray-800">{{ booking.bo_user?.name || '-' }}</span>
                  <span class="text-gray-400">·</span>
                  <span class="text-gray-500">{{ booking.bo_user?.phone || booking.bo_user?.email || '' }}</span>
                  <template v-if="booking.bo_user?.companyname">
                    <span class="text-gray-400">·</span>
                    <span class="text-gray-500 italic text-xs">{{ booking.bo_user.companyname }}</span>
                  </template>
                </div>
                <div class="flex items-center gap-2 text-xs shrink-0">
                  <span class="font-mono bg-gray-200 text-gray-500 px-2 py-0.5 rounded">
                    #{{ booking.skey || booking.id.slice(0, 8) }}
                  </span>
                  <span class="font-semibold text-green-600">Rp {{ formatCurrency(booking.grandtotal) }}</span>
                  <span v-if="booking.lines.every(l => l.reservation)"
                    class="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded font-bold">
                    <i class="pi pi-check text-xs"></i> Hadir
                  </span>
                </div>
              </div>

              <!-- Booking lines -->
              <div v-for="line in booking.lines" :key="line._key"
                class="px-5 py-3 flex items-center justify-between gap-3 transition-colors"
                :class="line.reservation ? 'bg-green-50/60' : 'hover:bg-gray-50'">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-3 h-3 rounded-full shrink-0 transition-all"
                    :class="line.reservation
                      ? 'bg-green-500 shadow-sm shadow-green-300'
                      : 'bg-gray-300'"></div>
                  <div class="min-w-0">
                    <div class="font-semibold text-gray-800 text-sm flex items-center gap-2 flex-wrap">
                      {{ line.bo_slot?.start_time }} – {{ line.bo_slot?.end_time }}
                      <span v-if="line._type === 'jogging'"
                        class="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-bold">
                        👥 {{ line.jumlah_orang }} orang
                      </span>
                    </div>
                    <div class="text-xs text-gray-400 truncate">
                      {{ line.bo_slot?.name }}
                      <template v-if="line._type === 'jogging'">
                        · Rp {{ formatCurrency(line.harga_per_orang) }}/org
                        · Total Rp {{ formatCurrency(line.price) }}
                      </template>
                      <template v-else>· Rp {{ formatCurrency(line.price) }}</template>
                    </div>
                  </div>
                </div>
                <button @click="toggleReservation(line)" :disabled="isUpdating[line._key]"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-all shrink-0"
                  :class="line.reservation
                    ? 'bg-green-500 border-green-500 text-white hover:bg-green-600'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-purple-400 hover:text-purple-600'">
                  <i class="text-xs"
                    :class="isUpdating[line._key]
                      ? 'pi pi-spin pi-spinner'
                      : line.reservation ? 'pi pi-check' : 'pi pi-circle'"></i>
                  <span class="hidden sm:inline">{{ line.reservation ? 'Hadir' : 'Belum' }}</span>
                </button>
              </div>

            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ══ SCANNER MODAL ══ -->
    <Teleport to="body">
      <div v-if="showScanner"
        class="fixed inset-0 flex items-end sm:items-center justify-center"
        style="z-index:99999;background:rgba(0,0,0,0.82)">

        <!-- Sheet / Dialog box -->
        <div class="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">

          <!-- Header -->
          <div class="flex items-center justify-between px-5 pt-5 pb-3">
            <div class="flex items-center gap-2">
              <i class="pi pi-qrcode text-purple-600 text-xl"></i>
              <span class="font-bold text-gray-800 text-lg">Scan QR Tiket</span>
            </div>
            <button @click="closeScanner"
              class="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
              <i class="pi pi-times text-gray-600"></i>
            </button>
          </div>

          <div class="px-5 pb-6 flex flex-col gap-4">

            <!-- Viewport kamera -->
            <div class="relative bg-black rounded-2xl overflow-hidden" style="aspect-ratio:1;max-height:65vw">

              <!-- Elemen video — pakai id bukan ref agar tidak terpengaruh Teleport -->
              <video
                id="scanner-video"
                class="w-full h-full object-cover"
                playsinline
                muted
                autoplay
              ></video>

              <!-- Frame overlay -->
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <!-- Sudut-sudut frame -->
                <div class="relative" style="width:60%;aspect-ratio:1">
                  <div class="absolute top-0 left-0 w-8 h-8 border-t-[3px] border-l-[3px] border-amber-400 rounded-tl-lg"></div>
                  <div class="absolute top-0 right-0 w-8 h-8 border-t-[3px] border-r-[3px] border-amber-400 rounded-tr-lg"></div>
                  <div class="absolute bottom-0 left-0 w-8 h-8 border-b-[3px] border-l-[3px] border-amber-400 rounded-bl-lg"></div>
                  <div class="absolute bottom-0 right-0 w-8 h-8 border-b-[3px] border-r-[3px] border-amber-400 rounded-br-lg"></div>
                  <!-- Garis scan -->
                  <div class="absolute left-0 right-0 h-0.5 bg-amber-400/80 rounded animate-bounce" style="top:50%"></div>
                </div>
              </div>

              <!-- Overlay: loading kamera -->
              <div v-if="!cameraReady && !scanError"
                class="absolute inset-0 bg-black flex flex-col items-center justify-center gap-3 text-white">
                <i class="pi pi-spin pi-spinner text-3xl text-amber-400"></i>
                <span class="text-sm">Membuka kamera...</span>
              </div>

              <!-- Overlay: processing -->
              <div v-if="isProcessingScan"
                class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 text-white">
                <i class="pi pi-spin pi-spinner text-4xl text-amber-400"></i>
                <span class="font-semibold">Memproses check-in...</span>
              </div>

              <!-- Hint kamera aktif -->
              <div v-if="cameraReady && !isProcessingScan && !scanResult && !scanError"
                class="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                <span class="bg-black/50 text-white text-xs px-3 py-1 rounded-full">
                  Arahkan QR ke dalam kotak
                </span>
              </div>
            </div>

            <!-- Feedback sukses -->
            <div v-if="scanResult"
              class="flex items-start gap-3 p-4 bg-green-50 border-2 border-green-400 rounded-xl">
              <i class="pi pi-check-circle text-green-600 text-2xl shrink-0 mt-0.5"></i>
              <p class="font-semibold text-green-800 text-sm leading-relaxed">{{ scanResult }}</p>
            </div>

            <!-- Feedback error -->
            <div v-if="scanError"
              class="flex flex-col gap-2 p-4 bg-red-50 border-2 border-red-300 rounded-xl">
              <div class="flex items-start gap-3">
                <i class="pi pi-exclamation-circle text-red-500 text-xl shrink-0 mt-0.5"></i>
                <p class="text-red-700 text-sm leading-relaxed">{{ scanError }}</p>
              </div>

            </div>

            <!-- Tombol Scan Lagi -->
            <button v-if="scanResult || scanError"
              @click="scanAgain"
              class="w-full flex items-center justify-center gap-2 py-3 bg-purple-600 hover:bg-purple-700
                     text-white font-semibold rounded-xl transition-colors">
              <i class="pi pi-qrcode"></i>
              Scan Lagi
            </button>

            <!-- Input manual -->
            <div class="border-t border-gray-200 pt-3">
              <p class="text-xs text-gray-500 mb-2 font-semibold">Input URL atau ID booking manual:</p>
              <div class="flex gap-2">
                <InputText
                  v-model="manualUrl"
                  placeholder="URL atau ID booking..."
                  class="flex-1 text-sm"
                  @keyup.enter="handleManualInput"
                />
                <Button icon="pi pi-check" severity="success" @click="handleManualInput" :disabled="!manualUrl.trim()" />
              </div>
            </div>

          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>