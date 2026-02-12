<script setup>
import CRUD from '../../components/CRUD/CRUD.vue';

const columns = [
    {
        field: 'name',
        name: 'Name',
        type: 'string',
        sortable: true,
        required: true,
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
        field: 'start_time',
        name: 'Start',
        type: 'string',
        sortable: true,
        required: false,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'end_time',
        name: 'End',
        type: 'string',
        sortable: true,
        required: false,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'seqno',
        name: 'Sequence',
        type: 'string',
        sortable: true,
        required: false,
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
    <CRUD entity="Slot" objectname="bo_slot" title="Slots" :columns="columns"></CRUD>
</template>