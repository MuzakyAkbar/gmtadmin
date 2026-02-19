<script setup>
import { ref, onMounted, computed } from 'vue'
import RestService from '../../services/rest'

const svcVenue = new RestService('bo_venue')
const svcSlot = new RestService('bo_slot')
const svcPrice = new RestService('bo_price')

const venues = ref([])
const selectedVenue = ref(null)
const showModal = ref(false)
const slots = ref([])
const prices = ref([])
const loading = ref(false)
const showPriceForm = ref(false)

const priceTypes = [
  { value: 'regular', label: 'Regular' },
  { value: 'primetime', label: 'Prime Time' },
  { value: 'special_date', label: 'Special Date' }
]

const dayOptions = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

const priceForm = ref({
  id: null,
  bo_slot_id: null,
  price_type: 'regular',
  pricing_mode: 'per_slot', // 'per_slot' atau 'per_person'
  amount: 0,
  price_per_person: 0,
  kapasitas: null, // kapasitas hanya untuk per_person
  is_primetime: false,
  primetime_days: [],
  start_date: null,
  end_date: null
})

onMounted(async () => {
  await loadVenues()
})

const loadVenues = async () => {
  const result = await svcVenue.list(0, 100, [{ col: 'seqno', asc: true }])
  if (result.data) {
    venues.value = result.data.filter(v => v.isactive)
  }
}

const openVenueModal = async (venue) => {
  selectedVenue.value = venue
  showModal.value = true
  loading.value = true
  
  await Promise.all([
    loadSlots(),
    loadPrices(venue.id)
  ])
  
  loading.value = false
}

const loadSlots = async () => {
  const result = await svcSlot.list(0, 100, [{ col: 'seqno', asc: true }])
  if (result.data) {
    slots.value = result.data.filter(s => s.isactive)
  }
}

const loadPrices = async (venueId) => {
  const where = [
    { field: 'bo_venue_id', op: 'eq', value: venueId }
    // Tampilkan semua (active dan inactive)
  ]
  
  const result = await svcPrice.listwhere(0, 100, where)
  
  if (result.data && result.data.length > 0) {
    // Get unique slot IDs
    const slotIds = [...new Set(result.data.map(p => p.bo_slot_id).filter(id => id))]
    
    if (slotIds.length > 0) {
      // Load all slots at once
      const slotsResult = await svcSlot.listwhere(0, 250, [
        { field: 'id', op: 'in', value: slotIds }
      ])
      
      if (slotsResult.data) {
        // Create slot map
        const slotMap = {}
        slotsResult.data.forEach(slot => {
          slotMap[slot.id] = slot
        })
        
        // Attach slot data to each price
        result.data.forEach(price => {
          price.bo_slot = slotMap[price.bo_slot_id]
        })
      }
    }
  }
  
  prices.value = result.data || []
}

const getPricesForSlot = (slotId) => {
  return prices.value.filter(p => p.bo_slot_id === slotId)
}

const calculateDuration = (startTime, endTime) => {
  if (!startTime || !endTime) return 0
  
  const [startHour, startMin] = startTime.split(':').map(Number)
  const [endHour, endMin] = endTime.split(':').map(Number)
  
  let hours = endHour - startHour
  const mins = endMin - startMin
  
  if (mins < 0) {
    hours -= 1
  }
  
  if (hours < 0) {
    hours += 24 // handle overnight slots
  }
  
  return hours + (mins / 60)
}

const openPriceForm = (slot = null, price = null) => {
  if (price) {
    // Clone price tapi hapus field non-database
    const { bo_slot, ...cleanPrice } = price
    // Deteksi pricing_mode dari data yang ada
    const hasPricePerPerson = cleanPrice.price_per_person && cleanPrice.price_per_person > 0
    const hasAmount = cleanPrice.amount && cleanPrice.amount > 0
    
    priceForm.value = { 
      ...cleanPrice,
      pricing_mode: hasPricePerPerson ? 'per_person' : 'per_slot'
    }
  } else {
    priceForm.value = {
      id: null,
      bo_slot_id: slot?.id,
      price_type: 'regular',
      pricing_mode: selectedVenue.value?.pricing_type === 'per_person' ? 'per_person' : 'per_slot',
      amount: 0,
      price_per_person: 0,
      kapasitas: null,
      is_primetime: false,
      primetime_days: [],
      start_date: null,
      end_date: null
    }
  }
  showPriceForm.value = true
}

const savePriceForm = async () => {
  try {
    const data = {
      bo_venue_id: selectedVenue.value.id,
      bo_slot_id: priceForm.value.bo_slot_id,
      price_type: priceForm.value.price_type,
      is_primetime: priceForm.value.price_type === 'primetime',
      primetime_days: priceForm.value.price_type === 'primetime' ? priceForm.value.primetime_days : null,
      start_date: priceForm.value.price_type === 'special_date' ? priceForm.value.start_date : null,
      end_date: priceForm.value.price_type === 'special_date' ? priceForm.value.end_date : null,
      isactive: true
    }
    
    // Set price based on pricing_mode (bukan venue pricing_type)
    if (priceForm.value.pricing_mode === 'per_person') {
      data.price_per_person = priceForm.value.price_per_person
      data.amount = null
      data.kapasitas = priceForm.value.kapasitas || null
    } else {
      data.amount = priceForm.value.amount
      data.price_per_person = null
      data.kapasitas = null // per_slot tidak ada kapasitas
    }
    
    if (priceForm.value.id) {
      await svcPrice.update(priceForm.value.id, data)
    } else {
      await svcPrice.add(data)
    }
    
    await loadPrices(selectedVenue.value.id)
    showPriceForm.value = false
  } catch (error) {
    console.error('Error saving price:', error)
    alert('Gagal menyimpan harga: ' + (error.message || JSON.stringify(error)))
  }
}

const togglePriceStatus = async (price) => {
  const updateData = { 
    isactive: !price.isactive 
  }
  await svcPrice.update(price.id, updateData)
  await loadPrices(selectedVenue.value.id)
}

const deletePrice = async (priceId) => {
  if (confirm('Hapus harga ini secara permanen dari database?')) {
    try {
      // Hard delete - benar-benar hapus dari database
      await svcPrice.delete(priceId)
      
      // Reload data untuk refresh tampilan
      await loadPrices(selectedVenue.value.id)
    } catch (error) {
      console.error('Error deleting price:', error)
      alert('Gagal menghapus harga: ' + (error.message || 'Unknown error'))
    }
  }
}

const formatCurrency = (value) => {
  if (!value) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
  }).format(value)
}

const formatDate = (date) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('id-ID')
}

const getPriceTypeLabel = (type) => {
  return priceTypes.find(t => t.value === type)?.label || type
}

const isPricingPerPerson = () => {
  return selectedVenue.value?.pricing_type === 'per_person'
}
</script>

<template>
  <div class="p-6">
    <h1 class="text-2xl font-bold mb-6">Venue Pricing Management</h1>
    
    <!-- Venue Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <div 
        v-for="venue in venues" 
        :key="venue.id"
        @click="openVenueModal(venue)"
        class="border rounded-lg p-4 cursor-pointer hover:shadow-lg transition-shadow bg-white"
      >
        <img 
          v-if="venue.image1" 
          :src="venue.image1" 
          :alt="venue.name"
          class="w-full h-48 object-cover rounded-md mb-3"
        />
        <div class="flex justify-between items-start mb-2">
          <h3 class="font-semibold text-lg">{{ venue.name }}</h3>
          <span 
            v-if="venue.pricing_type"
            class="text-xs px-2 py-1 rounded"
            :class="venue.pricing_type === 'per_person' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'"
          >
            {{ venue.pricing_type === 'per_person' ? 'Per Person' : 'Per Slot' }}
          </span>
        </div>
        <p class="text-gray-600 text-sm mt-1">{{ venue.description }}</p>
        <button class="mt-3 text-blue-600 text-sm font-medium">
          Configure Pricing →
        </button>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
      <div class="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b p-4 flex justify-between items-center">
          <div>
            <h2 class="text-xl font-bold">{{ selectedVenue?.name }} - Pricing</h2>
            <span 
              v-if="selectedVenue?.pricing_type"
              class="text-sm px-2 py-1 rounded mt-1 inline-block"
              :class="isPricingPerPerson() ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'"
            >
              {{ isPricingPerPerson() ? 'Pricing per Person per Hour' : 'Pricing per Slot' }}
            </span>
          </div>
          <button @click="showModal = false" class="text-gray-500 hover:text-gray-700 text-2xl">✕</button>
        </div>

        <div v-if="loading" class="p-8 text-center">Loading...</div>

        <div v-else class="p-6">
          <!-- Slots Pricing -->
          <div class="mb-8">
            <h3 class="text-lg font-semibold mb-4">Time Slots</h3>
            
            <div v-for="slot in slots" :key="slot.id" class="mb-6 border rounded-lg p-4">
              <div class="flex justify-between items-center mb-3">
                <div>
                  <h4 class="font-medium">{{ slot.name }}</h4>
                  <p class="text-sm text-gray-600">
                    {{ slot.start_time }} - {{ slot.end_time }}
                    <span class="ml-2 text-gray-500">
                      ({{ calculateDuration(slot.start_time, slot.end_time).toFixed(1) }} jam)
                    </span>
                  </p>
                </div>
                <button 
                  @click="openPriceForm(slot)"
                  class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                >
                  + Add Price
                </button>
              </div>

              <div class="space-y-2">
                <div 
                  v-for="price in getPricesForSlot(slot.id)" 
                  :key="price.id"
                  class="flex justify-between items-center p-3 rounded"
                  :class="price.isactive ? 'bg-gray-50' : 'bg-gray-100 opacity-60'"
                >
                  <div class="flex-1">
                    <div class="flex gap-2 items-center flex-wrap">
                      <span class="font-medium" :class="!price.isactive && 'line-through text-gray-500'">
                        {{ price.price_per_person 
                          ? formatCurrency(price.price_per_person) + '/orang/jam' 
                          : formatCurrency(price.amount) 
                        }}
                      </span>
                      <span v-if="price.kapasitas" class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">
                        Kapasitas: {{ price.kapasitas }} orang
                      </span>
                      <span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {{ getPriceTypeLabel(price.price_type) }}
                      </span>
                      <span 
                        v-if="!price.isactive"
                        class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded"
                      >
                        Inactive
                      </span>
                      <span 
                        v-else
                        class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded"
                      >
                        Active
                      </span>
                    </div>
                    <div class="text-xs text-gray-600 mt-1">
                      <span v-if="price.primetime_days?.length">
                        Hari: {{ price.primetime_days.join(', ') }}
                      </span>
                      <span v-if="price.start_date">
                        {{ price.primetime_days?.length ? ' | ' : '' }}
                        {{ formatDate(price.start_date) }} - {{ formatDate(price.end_date) }}
                      </span>
                    </div>
                  </div>
                  <div class="flex gap-2 items-center">
                    <!-- Toggle Switch -->
                    <button
                      @click="togglePriceStatus(price)"
                      class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      :class="price.isactive ? 'bg-blue-600' : 'bg-gray-300'"
                    >
                      <span
                        class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                        :class="price.isactive ? 'translate-x-6' : 'translate-x-1'"
                      />
                    </button>
                    <button 
                      @click="openPriceForm(slot, price)"
                      class="text-blue-600 text-sm hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button 
                      @click="deletePrice(price.id)"
                      class="text-red-600 text-sm hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div v-if="getPricesForSlot(slot.id).length === 0" class="text-gray-500 text-sm italic p-2">
                  Belum ada harga yang dikonfigurasi
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Price Form Modal -->
    <div v-if="showPriceForm" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
      <div class="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h3 class="text-lg font-bold mb-4">
          {{ priceForm.id ? 'Edit' : 'Tambah' }} Harga
        </h3>
        
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-1">Mode Pricing</label>
            <select v-model="priceForm.pricing_mode" class="w-full border rounded px-3 py-2">
              <option value="per_slot">Per Slot</option>
              <option value="per_person">Per Orang/Jam</option>
            </select>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Tipe Harga</label>
            <select v-model="priceForm.price_type" class="w-full border rounded px-3 py-2">
              <option v-for="type in priceTypes" :key="type.value" :value="type.value">
                {{ type.label }}
              </option>
            </select>
          </div>

          <div v-if="priceForm.pricing_mode === 'per_person'">
            <label class="block text-sm font-medium mb-1">Harga per Orang per Jam (Rp)</label>
            <input v-model.number="priceForm.price_per_person" type="number" class="w-full border rounded px-3 py-2" />
          </div>

          <div v-if="priceForm.pricing_mode === 'per_person'">
            <label class="block text-sm font-medium mb-1">Kapasitas Maksimal (Orang)</label>
            <input v-model.number="priceForm.kapasitas" type="number" min="1" class="w-full border rounded px-3 py-2" placeholder="Kosongkan jika tidak ada batasan" />
            <p class="text-xs text-gray-500 mt-1">Jumlah maksimal orang yang bisa booking untuk slot ini</p>
          </div>

          <div v-else>
            <label class="block text-sm font-medium mb-1">Harga per Slot (Rp)</label>
            <input v-model.number="priceForm.amount" type="number" class="w-full border rounded px-3 py-2" />
          </div>

          <div v-if="priceForm.price_type === 'primetime'">
            <label class="block text-sm font-medium mb-1">Hari Prime Time</label>
            <div class="grid grid-cols-4 gap-2">
              <label v-for="day in dayOptions" :key="day" class="flex items-center gap-1 text-sm">
                <input type="checkbox" :value="day" v-model="priceForm.primetime_days" />
                <span class="capitalize">{{ day }}</span>
              </label>
            </div>
          </div>

          <div v-if="priceForm.price_type === 'special_date'" class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-1">Tanggal Mulai</label>
              <input v-model="priceForm.start_date" type="date" class="w-full border rounded px-3 py-2" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Tanggal Selesai</label>
              <input v-model="priceForm.end_date" type="date" class="w-full border rounded px-3 py-2" />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 mt-6">
          <button @click="showPriceForm = false" class="px-4 py-2 border rounded hover:bg-gray-50">
            Batal
          </button>
          <button @click="savePriceForm" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Simpan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>