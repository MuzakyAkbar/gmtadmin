<script setup>
import CRUD from '../../components/CRUD/CRUD.vue';

const columns = [
    {
        field: 'name',
        name: 'Name',
        type: 'string',
        required: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'category',
        name: 'Category',
        type: 'string',
        required: false,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'description',
        name: 'Description',
        type: 'string',
        sortable: true,
        required: false,
        showintable: false,
        isdisplayed: true,
    },
    {
        field: 'image1',
        name: 'Image 1',
        type: 'string',
        sortable: true,
        required: false,
        showintable: false,
        isdisplayed: true,
    },
    {
        field: 'image2',
        name: 'Image 2',
        type: 'string',
        sortable: true,
        required: false,
        showintable: false,
        isdisplayed: true,
    },
    {
        field: 'isactive',
        name: 'Active',
        type: 'boolean',
        showintable: true,
        isdisplayed: true,
    },
]

</script>
<template>
    <CRUD entity="Venue" objectname="bo_venue" title="Venues" :columns="columns"></CRUD>
</template>