<script setup lang="ts">
// Root shell — layout + page under Nuxt UI's app provider.
// Pages set their own "<Page> · Tick" titles; this template only fills in
// the fallback when a page sets none.
useHead({
  titleTemplate: title => title || 'Tick'
})
</script>

<template>
  <UApp>
    <!-- Injects <link rel="manifest"> into the head (@vite-pwa/nuxt) -->
    <NuxtPwaManifest />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
