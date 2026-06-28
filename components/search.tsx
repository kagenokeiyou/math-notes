'use client'
import { create } from '@orama/orama'
import { stopwords } from '@orama/stopwords/mandarin'
import { createTokenizer } from '@orama/tokenizers/mandarin'
import { useDocsSearch } from 'fumadocs-core/search/client'
import { oramaStaticClient } from 'fumadocs-core/search/client/orama-static'
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SharedProps,
} from 'fumadocs-ui/components/dialog/search'
import { basePath } from '@/lib/shared'

function initOrama() {
  return create({
    schema: { _: 'string' },
    components: {
      tokenizer: createTokenizer({
        language: 'mandarin',
        stopWords: stopwords,
      }),
    },
  })
}

export default function DefaultSearchDialog(props: SharedProps) {
  const { search, setSearch, query } = useDocsSearch({
    client: oramaStaticClient({
      from: `${basePath}/api/search`,
      initOrama,
    }),
  })

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== 'empty' ? query.data : null} />
      </SearchDialogContent>
    </SearchDialog>
  )
}
