import { defineStore } from "pinia";
import { ref } from "vue";

export const useReferenceStore = defineStore("reference", () => {
  const reference = ref([]);

  function setRefValue(revval) {
    reference.value = revval;
  }

  return { reference, setRefValue };
});
