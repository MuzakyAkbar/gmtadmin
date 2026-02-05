<template>
    <Dropdown v-model="selectedLanguage" :options="languages" optionLabel="name" optionValue="code"
    placeholder="Language" class="mx-1 p-dropdown-sm" @change="changeLanguage"></Dropdown>
</template>

<script>

    export default {
        name: 'SwitchLang',
        data() {
            return {
                selectedLanguage: '',
                languages: [{
                        name: 'Indonesia',
                        code: 'id'
                    },
                    {
                        name: 'English',
                        code: 'en'
                    },
                ],
            }
        },
        methods: {
            async changeLanguage(){
              const lang = this.selectedLanguage
              localStorage.setItem('locale',lang)
              await this.loadLanguage(lang)
            },
            async loadLanguage(lang){
              this.$i18n.locale = lang
              this.selectedLanguage = lang
              this.$moment.locale(lang)
            },
            async checkLanguage(){
              const language = localStorage.getItem('locale')
              if(language == null){
                localStorage.setItem('locale', process.env.VUE_APP_I18N_LOCALE)
              }
              this.loadLanguage(language)
            },
        },
        mounted() {
          this.checkLanguage()
        },
    }
</script>
