import { formatElapsedTime, getDocumentIndexId, getDocumentProperties, validateSchema } from '../components/defaults.js'
import { createDocumentsStore } from '../components/documents-store.js'
import { OBJECT_COMPONENTS, FUNCTION_COMPONENTS, SINGLE_OR_ARRAY_COMPONENTS } from '../components/hooks.js'
import { createIndex } from '../components/index.js'
import { createTokenizer } from '../components/tokenizer/index.js'
import { createError } from '../errors.js'
import { uniqueId } from '../utils.js'
import {
  ArrayCallbackComponents,
  Components,
  Orama,
  Schema,
  FunctionComponents,
  SingleOrArrayCallbackComponents,
  Tokenizer,
  SorterConfig,
  OpaqueIndex,
  OpaqueDocumentStore,
  OpaqueSorter,
  ProvidedTypes,
} from '../types.js'
import { createSorter } from '../components/sorter.js'

interface CreateArguments<A extends ProvidedTypes> {
  schema: Schema
  sort?: SorterConfig
  language?: string
  components?: Components<A>
  id?: string
}

function validateComponents<A extends ProvidedTypes>(components: Components<A>) {
  const defaultComponents = {
    formatElapsedTime,
    getDocumentIndexId,
    getDocumentProperties,
    validateSchema,
  }

  for (const rawKey of FUNCTION_COMPONENTS) {
    const key = rawKey as keyof FunctionComponents

    if (components[key]) {
      if (typeof components[key] !== 'function') {
        throw createError('COMPONENT_MUST_BE_FUNCTION', key)
      }
    } else {
      // @ts-expect-error TSC is unable to resolve this
      components[key] = defaultComponents[key]
    }
  }

  for (const rawKey of SINGLE_OR_ARRAY_COMPONENTS) {
    const key = rawKey as keyof ArrayCallbackComponents<A>

    if (!components[key]) {
      components[key] = []
    } else if (!Array.isArray(components[key])) {
      // @ts-expect-error TSC is unable to resolve this
      components[key] = [components[key]]
    }

    for (const fn of components[key] as unknown as SingleOrArrayCallbackComponents<A>[]) {
      if (typeof fn !== 'function') {
        throw createError('COMPONENT_MUST_BE_FUNCTION_OR_ARRAY_FUNCTIONS', key)
      }
    }
  }

  for (const rawKey of Object.keys(components)) {
    if (
      !OBJECT_COMPONENTS.includes(rawKey) &&
      !FUNCTION_COMPONENTS.includes(rawKey) &&
      !SINGLE_OR_ARRAY_COMPONENTS.includes(rawKey)
    ) {
      throw createError('UNSUPPORTED_COMPONENT', rawKey)
    }
  }
}

export async function create<A extends ProvidedTypes>({
  schema,
  sort,
  language,
  components,
  id,
}: CreateArguments<A>): Promise<Orama<A>> {
  if (!components) {
    components = {}
  }

  if (!id) {
    id = await uniqueId()
  }

  let tokenizer = components.tokenizer as Tokenizer
  let index: OpaqueIndex | undefined = components.index
  let documentsStore: OpaqueDocumentStore | undefined = components.documentsStore
  let sorter: OpaqueSorter | undefined = components.sorter

  if (!tokenizer) {
    // Use the default tokenizer
    tokenizer = await createTokenizer({ language: language ?? 'english' })
  } else if (!tokenizer.tokenize) {
    // If there is no tokenizer function, we assume this is a TokenizerConfig
    tokenizer = await createTokenizer(tokenizer)
  }

  if (components.tokenizer && language) {
    // Accept language only if a tokenizer is not provided
    throw createError('NO_LANGUAGE_WITH_CUSTOM_TOKENIZER')
  }

  if (!index) {
    index = await createIndex()
  }

  if (!sorter) {
    sorter = await createSorter()
  }

  if (!documentsStore) {
    documentsStore = await createDocumentsStore()
  }

  // Validate all other components
  validateComponents(components)

  // Assign only recognized components and hooks
  const {
    getDocumentProperties,
    getDocumentIndexId,
    validateSchema,
    beforeInsert,
    afterInsert,
    beforeRemove,
    afterRemove,
    beforeUpdate,
    afterUpdate,
    beforeMultipleInsert,
    afterMultipleInsert,
    beforeMultipleRemove,
    afterMultipleRemove,
    beforeMultipleUpdate,
    afterMultipleUpdate,
    formatElapsedTime,
  } = components

  const orama = {
    data: {},
    caches: {},
    schema,
    tokenizer,
    index,
    sorter,
    documentsStore,
    getDocumentProperties,
    getDocumentIndexId,
    validateSchema,
    beforeInsert,
    afterInsert,
    beforeRemove,
    afterRemove,
    beforeUpdate,
    afterUpdate,
    beforeMultipleInsert,
    afterMultipleInsert,
    beforeMultipleRemove,
    afterMultipleRemove,
    beforeMultipleUpdate,
    afterMultipleUpdate,
    formatElapsedTime,
    id,
  } as Orama

  orama.data = {
    index: await orama.index.create(orama, schema),
    docs: await orama.documentsStore.create(orama),
    sorting: await orama.sorter.create(orama, schema, sort),
  }

  return orama
}
