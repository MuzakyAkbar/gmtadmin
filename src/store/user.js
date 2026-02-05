import { defineStore } from "pinia";
import { useStorage } from "@vueuse/core";
import { ref } from "vue";

export const useUserStore = defineStore("user", () => {
  const user = useStorage("user", ref({}));

  function setUser(nuser) {
    user.value = nuser;
    // console.log(user.value);

    // localStorage.setItem("user", JSON.stringify(nuser));
  }

  return { user, setUser };
});
