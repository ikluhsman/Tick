<script setup lang="ts">
// Docs page renderer — left navigation, page body, right table of contents.
import type { ContentNavigationItem } from '@nuxt/content'

const route = useRoute()

// Netlify's Pretty URLs redirect /about -> /about/, but content paths are
// stored without a trailing slash; a raw route.path lookup finds nothing at
// "/about/" and the page renders blank post-hydration with no console error.
const path = computed(() => route.path.replace(/\/+$/, '') || '/')

const navigation = inject<Ref<ContentNavigationItem[]>>('navigation')

const { data: page } = await useAsyncData(path.value, () => {
  return queryCollection('docs').path(path.value).first()
})
if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
}

const { data: surround } = await useAsyncData(`${path.value}-surround`, () => {
  return queryCollectionItemSurroundings('docs', path.value, {
    fields: ['description']
  })
})

useSeoMeta({
  title: page.value.title,
  description: page.value.description
})
</script>

<template>
  <UContainer>
    <UPage v-if="page">
      <template #left>
        <UPageAside>
          <UContentNavigation :navigation="navigation" highlight />
        </UPageAside>
      </template>

      <UPageHeader :title="page.title" :description="page.description" />

      <UPageBody>
        <ContentRenderer v-if="page.body" :value="page" />
        <USeparator v-if="surround?.length" />
        <UContentSurround :surround="surround" />
      </UPageBody>

      <template v-if="page?.body?.toc?.links?.length" #right>
        <UContentToc :links="page.body.toc.links" title="On this page" />
      </template>
    </UPage>
  </UContainer>
</template>
