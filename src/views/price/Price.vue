<script setup>
import CRUD from '../../components/CRUD/CRUD.vue';

const columns = [
    {
        field: 'bo_venue_id',
        name: 'Venue',
        type: 'options',
        source: {
            model:'bo_venue',
            labelfield:'name',
        },
        sortable: true,
        required: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'bo_slot_id',
        name: 'Slot',
        type: 'options',
        source: {
            model:'bo_slot',
            labelfield:'name',
        },
        sortable: true,
        required: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'amount',
        name: 'Price',
        type: 'currency',
        sortable: true,
        required: true,
        showintable: true,
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
    <CRUD entity="Price" objectname="bo_price" title="Prices" :columns="columns"></CRUD>
</template>
