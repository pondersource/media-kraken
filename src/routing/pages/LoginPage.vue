<template>
    <div class="flex flex-col flex-grow items-center justify-center py-8">
        <BaseIcon name="media-kraken" class="w-48 h-48" />
        <h1 class="mt-4 text-3xl font-semibold">Media Kraken</h1>
        <p class="my-4">Keep your movies and watch history in your own storage.</p>
        <BaseButton class="my-2" @click="connectStorage">Connect storage</BaseButton>
        <BaseButton class="my-2" @click="$auth.loginOffline()">Use browser storage</BaseButton>
    </div>
</template>
<script lang="ts">
import Vue from 'vue';
export default Vue.extend({
    methods: {
        connectStorage() {
            window.ponderStorage.open();
        },
    },
});
</script>
