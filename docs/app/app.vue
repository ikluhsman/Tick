<script setup lang="ts">
// Docs shell — header with logo + search, content pages, footer.
// Navigation + search sections come from the `docs` content collection.
const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('docs'))
const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('docs'), {
  server: false
})

provide('navigation', navigation)

useHead({
  htmlAttrs: { lang: 'en' }
})

useSeoMeta({
  titleTemplate: '%s · Tick docs',
  ogSiteName: 'Tick docs'
})
</script>

<template>
  <UApp>
    <UHeader :ui="{ title: 'items-center gap-2.5' }">
      <!--
        UHeader already wraps the #title slot in its own <ULink :to="to"> (default "/"),
        so this slot must contain NO link of its own. A NuxtLink here emitted nested
        <a> tags; the HTML parser is required to auto-close the outer anchor at the
        inner <a>, so the parsed server DOM had these nodes as *siblings* of the title
        anchor while the client vdom expects them as *children* — the hydration mismatch.
      -->
      <template #title>
        <TickLogo :size="30" glow />
        <span class="text-lg font-medium text-highlighted">Tick</span>
        <span class="text-lg font-normal text-muted">docs</span>
      </template>

      <template #right>
        <UContentSearchButton :collapsed="false" class="w-40 lg:w-56" />
        <UColorModeButton />
        <UButton
          color="neutral"
          variant="ghost"
          icon="i-simple-icons-github"
          aria-label="GitHub"
          to="https://github.com"
          target="_blank"
        />
      </template>

      <template #body>
        <UContentNavigation :navigation="navigation" highlight />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">Tick — self-hosted time tracking. MIT licensed.</p>
      </template>
      <template #right>
        <p class="text-sm text-muted">Built with Nuxt UI + Nuxt Content</p>
      </template>
    </UFooter>

    <ClientOnly>
      <LazyUContentSearch :files="files" :navigation="navigation" shortcut="meta_k" />
    </ClientOnly>
  </UApp>
</template>
