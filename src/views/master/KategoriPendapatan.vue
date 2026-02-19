<script setup>
import CRUD from '../../components/CRUD/CRUD.vue'

const columns = [
    {
        field: 'name',
        name: 'Nama Kategori',
        type: 'string',
        sortable: true,
        required: true,
        readonly: false,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'kode',
        name: 'Kode',
        type: 'string',
        sortable: true,
        required: false,
        readonly: false,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'description',
        name: 'Deskripsi',
        type: 'string',
        sortable: false,
        required: false,
        readonly: false,
        showintable: false,
        isdisplayed: true,
    },
    {
        field: 'created',
        name: 'Created At',
        type: 'date',
        sortable: true,
        required: false,
        showintable: false,
        isdisplayed: false,
        readonly: true,
    },
]
</script>

<template>
    <CRUD
        entity="Kategori Pendapatan"
        objectname="bo_kategori_pendapatan"
        title="Kategori Pendapatan"
        :columns="columns"
        :sortby="[{col:'name', asc:true}]"
    />
</template>