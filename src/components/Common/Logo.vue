<template>
    <img :src="logoimg" alt="">
     <!-- <img src="https://eproc.bestindoputramandiri.id/assets/img/logo.png" style="width: 30px;"/> -->
</template>
<script>
export default{
    props: {
        light: String
    },
    computed: {
        logoimg(){
            return this.light?'/img/logo-light.png':'/img/logo.png';
        }
    }
}
</script>
