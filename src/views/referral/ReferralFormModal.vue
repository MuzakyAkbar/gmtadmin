<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h2>{{ isEdit ? "Edit" : "Buat" }} Kode Referral</h2>
        <button @click="$emit('close')" class="btn-close">
          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="modal-body">
        <!-- Kode Referral -->
        <div class="form-group">
          <label class="required">Kode Referral</label>
          <input
            v-model="form.code"
            type="text"
            required
            placeholder="Contoh: DISKON50"
            @input="form.code = form.code.toUpperCase()"
            class="form-input"
          />
          <small class="form-hint">Kode akan otomatis diubah ke huruf kapital</small>
        </div>

        <!-- Deskripsi -->
        <div class="form-group">
          <label>Deskripsi</label>
          <textarea
            v-model="form.description"
            placeholder="Deskripsi kode referral (opsional)"
            rows="3"
            class="form-input"
          ></textarea>
        </div>

        <!-- Tipe & Nilai Diskon -->
        <div class="form-row">
          <div class="form-group">
            <label class="required">Tipe Diskon</label>
            <select v-model="form.discount_type" required class="form-input">
              <option value="percentage">Persentase (%)</option>
              <option value="amount">Jumlah (Rp)</option>
            </select>
          </div>

          <div class="form-group">
            <label class="required">
              Nilai Diskon
              <span v-if="form.discount_type === 'percentage'">(0-100%)</span>
            </label>
            <input
              v-model.number="form.discount_value"
              type="number"
              required
              :min="0"
              :max="form.discount_type === 'percentage' ? 100 : undefined"
              :step="form.discount_type === 'percentage' ? 1 : 1000"
              class="form-input"
            />
          </div>
        </div>

        <!-- Max Discount (untuk percentage) -->
        <div v-if="form.discount_type === 'percentage'" class="form-group">
          <label>Maksimal Diskon (Rp)</label>
          <input
            v-model.number="form.max_discount"
            type="number"
            min="0"
            step="1000"
            placeholder="Kosongkan jika tidak ada batasan"
            class="form-input"
          />
          <small class="form-hint">Batasi jumlah maksimal diskon untuk persentase</small>
        </div>

        <!-- Penerapan Diskon -->
        <div class="form-group">
          <label class="required">Penerapan Diskon</label>
          <div class="apply-options">
            <label
              :class="['apply-option', { selected: form.discount_apply_to === 'total' }]"
              @click="form.discount_apply_to = 'total'"
            >
              <input type="radio" v-model="form.discount_apply_to" value="total" style="display:none" />
              <span class="apply-icon">💰</span>
              <span class="apply-label-text">
                <strong>Total Booking</strong>
                <small>Diskon dari total keseluruhan booking</small>
              </span>
            </label>
            <label
              :class="['apply-option', { selected: form.discount_apply_to === 'per_slot' }]"
              @click="form.discount_apply_to = 'per_slot'"
            >
              <input type="radio" v-model="form.discount_apply_to" value="per_slot" style="display:none" />
              <span class="apply-icon">🎟️</span>
              <span class="apply-label-text">
                <strong>Per Slot / Sesi</strong>
                <small>Diskon dikalikan jumlah slot yang dipesan</small>
              </span>
            </label>
          </div>
          <small v-if="form.discount_apply_to === 'per_slot' && form.discount_type === 'amount'" class="form-hint apply-hint">
            Contoh: diskon Rp {{ formatCurrency(form.discount_value || 50000) }}/slot → booking 3 slot = diskon Rp {{ formatCurrency((form.discount_value || 50000) * 3) }}
          </small>
          <small v-else-if="form.discount_apply_to === 'per_slot' && form.discount_type === 'percentage'" class="form-hint apply-hint">
            Persentase dihitung dari harga per slot, bukan dari total booking
          </small>
          <small v-else class="form-hint apply-hint">
            Diskon dihitung sekali dari total booking keseluruhan
          </small>
        </div>

        <!-- Venue -->
        <div class="form-group">
          <label>Venue</label>
          <select v-model="form.bo_venue_id" class="form-input">
            <option :value="null">Semua Venue</option>
            <option v-for="venue in venues" :key="venue.id" :value="venue.id">
              {{ venue.name }}
            </option>
          </select>
          <small class="form-hint">Pilih venue spesifik atau biarkan kosong untuk semua venue</small>
        </div>

        <!-- Range Tanggal -->
        <div class="form-row">
          <div class="form-group">
            <label class="required">Tanggal Mulai</label>
            <input
              v-model="form.start_date"
              type="date"
              required
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label class="required">Tanggal Selesai</label>
            <input
              v-model="form.end_date"
              type="date"
              required
              :min="form.start_date"
              class="form-input"
            />
          </div>
        </div>

        <!-- Range Jam (Opsional) -->
        <div class="form-group">
          <div class="checkbox-wrapper">
            <input
              v-model="hasTimeRestriction"
              type="checkbox"
              id="has-time-restriction"
            />
            <label for="has-time-restriction">Batasi Jam Tertentu</label>
          </div>
        </div>

        <div v-if="hasTimeRestriction" class="form-row">
          <div class="form-group">
            <label class="required">Jam Mulai</label>
            <input
              v-model="form.start_time"
              type="time"
              :required="hasTimeRestriction"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label class="required">Jam Selesai</label>
            <input
              v-model="form.end_time"
              type="time"
              :required="hasTimeRestriction"
              class="form-input"
            />
          </div>
        </div>

        <!-- Batasan Penggunaan -->
        <div class="form-row">
          <div class="form-group">
            <label>Maksimal Penggunaan Total</label>
            <input
              v-model.number="form.max_usage"
              type="number"
              min="1"
              placeholder="Unlimited"
              class="form-input"
            />
            <small class="form-hint">Kosongkan untuk unlimited</small>
          </div>
          <div class="form-group">
            <label class="required">Maksimal Per User</label>
            <input
              v-model.number="form.max_usage_per_user"
              type="number"
              min="1"
              required
              class="form-input"
            />
          </div>
        </div>

        <!-- Minimal Transaksi -->
        <div class="form-group">
          <label>Minimal Transaksi (Rp)</label>
          <input
            v-model.number="form.min_transaction"
            type="number"
            min="0"
            step="1000"
            class="form-input"
          />
          <small class="form-hint">Atur minimal transaksi yang diperlukan untuk menggunakan kode ini</small>
        </div>

        <!-- Status Aktif -->
        <div class="form-group">
          <div class="checkbox-wrapper">
            <input v-model="form.isactive" type="checkbox" id="is-active" />
            <label for="is-active">Kode Referral Aktif</label>
          </div>
        </div>

        <!-- Actions -->
        <div class="modal-footer">
          <button type="button" @click="$emit('close')" class="btn btn-cancel">
            Batal
          </button>
          <button type="submit" :disabled="submitting" class="btn btn-submit">
            <svg v-if="submitting" class="icon-sm spinner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            {{ submitting ? "Menyimpan..." : isEdit ? "Update" : "Buat" }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import RestService from "../../services/rest";

const svc = new RestService("bo_referral");

const props = defineProps({
  referral: Object,
  venues: Array,
});

const emit = defineEmits(["close", "success"]);

const isEdit = computed(() => !!props.referral);
const submitting = ref(false);
const hasTimeRestriction = ref(false);

const form = ref({
  code: "",
  description: "",
  discount_type: "percentage",
  discount_value: 0,
  max_discount: null,
  discount_apply_to: "total",
  bo_venue_id: null,
  start_date: "",
  end_date: "",
  start_time: null,
  end_time: null,
  max_usage: null,
  max_usage_per_user: 1,
  min_transaction: 0,
  isactive: true,
});

// Get current user from localStorage
function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      return JSON.parse(userStr);
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
    }
  }
  return null;
}

// Populate form jika edit
if (props.referral) {
  form.value = {
    ...props.referral,
    start_date: props.referral.start_date,
    end_date: props.referral.end_date,
  };
  
  hasTimeRestriction.value = !!(
    props.referral.start_time && props.referral.end_time
  );
}

// Clear time fields when time restriction is disabled
watch(hasTimeRestriction, (newValue) => {
  if (!newValue) {
    form.value.start_time = null;
    form.value.end_time = null;
  }
});

// Clear max_discount when switching to amount type
watch(
  () => form.value.discount_type,
  (newType) => {
    if (newType === "amount") {
      form.value.max_discount = null;
    }
  }
);

function formatCurrency(value) {
  if (!value) return "0";
  return new Intl.NumberFormat("id-ID").format(value);
}

async function handleSubmit() {
  // Validasi
  if (form.value.end_date < form.value.start_date) {
    alert("Tanggal selesai tidak boleh lebih awal dari tanggal mulai");
    return;
  }

  if (
    hasTimeRestriction.value &&
    form.value.start_time &&
    form.value.end_time
  ) {
    if (form.value.end_time <= form.value.start_time) {
      alert("Jam selesai harus lebih besar dari jam mulai");
      return;
    }
  }

  submitting.value = true;

  try {
    const currentUser = getCurrentUser();
    const timestamp = new Date().toISOString();
    
    const payload = {
      code: form.value.code.trim().toUpperCase(),
      description: form.value.description?.trim() || null,
      discount_type: form.value.discount_type,
      discount_value: form.value.discount_value,
      max_discount: form.value.max_discount || null,
      discount_apply_to: form.value.discount_apply_to || 'total',
      bo_venue_id: form.value.bo_venue_id || null,
      start_date: form.value.start_date,
      end_date: form.value.end_date,
      start_time: hasTimeRestriction.value ? form.value.start_time : null,
      end_time: hasTimeRestriction.value ? form.value.end_time : null,
      max_usage: form.value.max_usage || null,
      max_usage_per_user: form.value.max_usage_per_user,
      min_transaction: form.value.min_transaction || 0,
      isactive: form.value.isactive,
      updated: timestamp,
      updatedby: currentUser?.name || null, // Menggunakan name dari user
    };

    let result;
    if (isEdit.value) {
      // Update
      result = await svc.update(props.referral.id, payload);
    } else {
      // Insert
      payload.created = timestamp;
      payload.createdby = currentUser?.name || null; // Menggunakan name dari user
      payload.current_usage = 0;
      result = await svc.add(payload);
    }

    if (result.error) throw result.error;

    emit("success");
  } catch (error) {
    console.error("Error saving referral:", error);
    alert("Error: " + error.message);
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.icon-sm {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.spinner-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 800px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  position: sticky;
  top: 0;
  background: white;
  z-index: 10;
  border-radius: 12px 12px 0 0;
}

.modal-header h2 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1a202c;
  margin: 0;
}

.btn-close {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-close:hover {
  background: #f1f5f9;
  color: #475569;
}

.modal-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #334155;
  font-size: 0.9rem;
}

.form-group label.required::after {
  content: " *";
  color: #ef4444;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.95rem;
  transition: all 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

textarea.form-input {
  resize: vertical;
  font-family: inherit;
}

.form-hint {
  display: block;
  margin-top: 0.5rem;
  color: #64748b;
  font-size: 0.85rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.checkbox-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.checkbox-wrapper input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.checkbox-wrapper label {
  margin: 0;
  cursor: pointer;
  user-select: none;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e2e8f0;
  margin-top: 1.5rem;
  position: sticky;
  bottom: 0;
  background: white;
  border-radius: 0 0 12px 12px;
}

.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-cancel {
  background: #f1f5f9;
  color: #475569;
}

.btn-cancel:hover {
  background: #e2e8f0;
}

.btn-submit {
  background: #3b82f6;
  color: white;
}

.btn-submit:hover:not(:disabled) {
  background: #2563eb;
  transform: translateY(-1px);
  box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Responsive Styles */
@media (max-width: 768px) {
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .modal-content {
    max-height: 95vh;
    border-radius: 12px 12px 0 0;
  }

  .modal-header {
    padding: 1.25rem;
  }

  .modal-header h2 {
    font-size: 1.25rem;
  }

  .modal-body {
    padding: 1.25rem;
  }

  .form-row {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .form-group {
    margin-bottom: 1.25rem;
  }

  .form-input {
    padding: 0.65rem;
    font-size: 0.9rem;
  }

  .modal-footer {
    gap: 0.75rem;
    padding-top: 1.25rem;
    margin-top: 1.25rem;
  }

  .btn {
    padding: 0.65rem 1.25rem;
    font-size: 0.9rem;
  }
}

@media (max-width: 480px) {
  .modal-header {
    padding: 1rem;
  }

  .modal-header h2 {
    font-size: 1.1rem;
  }

  .modal-body {
    padding: 1rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-input {
    padding: 0.6rem;
    font-size: 0.85rem;
  }

  .form-hint {
    font-size: 0.8rem;
  }

  .modal-footer {
    flex-direction: column-reverse;
    gap: 0.5rem;
  }

  .btn {
    width: 100%;
    padding: 0.65rem;
    font-size: 0.85rem;
    justify-content: center;
  }
}

/* Discount Apply To options */
.apply-options {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.apply-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
  background: #f8fafc;
  user-select: none;
}

.apply-option:hover {
  border-color: #93c5fd;
  background: #eff6ff;
}

.apply-option.selected {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.apply-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.apply-label-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.apply-label-text strong {
  font-size: 0.9rem;
  color: #1e293b;
  font-weight: 600;
}

.apply-label-text small {
  font-size: 0.78rem;
  color: #64748b;
  line-height: 1.3;
}

.apply-hint {
  color: #2563eb !important;
  background: #eff6ff;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  border-left: 3px solid #3b82f6;
}

@media (max-width: 480px) {
  .apply-options {
    grid-template-columns: 1fr;
  }
}
</style>