import { stopwords } from '@orama/stopwords/mandarin'
import { createTokenizer } from '@orama/tokenizers/mandarin'
import { createFromSource } from 'fumadocs-core/search/server'
import { basePath } from '@/lib/shared'
import { source } from '@/lib/source'

export const revalidate = false

function stripBasePath(url: string) {
  if (url.startsWith(basePath)) {
    return url.slice(basePath.length) || '/'
  }
  return url
}

export const { staticGET: GET } = createFromSource(source, {
  components: {
    tokenizer: createTokenizer({
      language: 'mandarin',
      stopWords: stopwords,
    }),
  },
  buildIndex: (page) => ({
    title: page.data.title,
    description: page.data.description,
    url: stripBasePath(page.url),
    id: page.url,
    structuredData: page.data.structuredData,
  }),
})
