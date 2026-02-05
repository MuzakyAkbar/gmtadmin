<script setup>
import CRUD from '../../components/CRUD/CRUD.vue';

const columns = [
    {
        field: 'created',
        name: 'Tanggal',
        type: 'date',
        sortable: true,
        required: true,
        showintable: true,
        isdisplayed: true,
        readonly: true,
    },
    {
        field: 'payment_channel',
        name: 'Payment Channel',
        type: 'string',
        required: true,
        readonly: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'totalbayar',
        name: 'Amount',
        type: 'currency',
        required: true,
        readonly: true,
        showintable: true,
        isdisplayed: true,
    },
    {
        field: 'bo_booking_id',
        name: 'Booking ID',
        type: 'options',
        source: {
            model:'bo_booking',
            labelfield:'skey',
        },
        required: true,
        showintable: true,
        isdisplayed: true,
        readonly: true,
    },
    {
        field: 'bo_user_id',
        name: 'User',
        type: 'options',
        source: {
            model:'bo_user',
            labelfield:'name',
        },
        required: true,
        showintable: true,
        isdisplayed: true,
        readonly: true,
    },
    {
        field: 'status',
        name: 'Status',
        type: 'string',
        required: true,
        showintable: true,
        isdisplayed: true,
    },
]

</script>
<template>
    <CRUD entity="Payment" objectname="bo_payment" title="Payments" :columns="columns" details="abc"></CRUD>
</template>
