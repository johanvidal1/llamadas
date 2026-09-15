import assert from 'node:assert/strict'
import {
  parseBatchQueueMode,
  pickNextBatchByPolicy,
  resolveWorkingBatchId,
  shouldAutoAdvancePinnedBatch,
  canHydrateBatchQueue,
  canPersistHydratedWorkingBatch,
  shouldRehydrateEmptyTodos,
  type QueueBatchInput,
} from './batchQueuePolicy.ts'

function section(name: string) {
  console.log(`\n• ${name}`)
}

const oldest: QueueBatchInput = {
  id: 'old',
  createdAt: '2026-01-01T10:00:00.000Z',
  pending: 4,
}
const middle: QueueBatchInput = {
  id: 'mid',
  createdAt: '2026-06-01T10:00:00.000Z',
  pending: 2,
}
const newest: QueueBatchInput = {
  id: 'new',
  createdAt: '2026-09-01T10:00:00.000Z',
  pending: 8,
}

section('parseBatchQueueMode defaults to FIFO')
assert.equal(parseBatchQueueMode(undefined), 'FIFO')
assert.equal(parseBatchQueueMode('nope'), 'FIFO')
assert.equal(parseBatchQueueMode('LIFO'), 'LIFO')
assert.equal(parseBatchQueueMode('ALL'), 'ALL')

section('FIFO picks oldest with pending')
assert.equal(pickNextBatchByPolicy('FIFO', [newest, middle, oldest]), 'old')
assert.equal(
  pickNextBatchByPolicy('FIFO', [
    { ...newest, pending: 0 },
    { ...middle, pending: 0 },
    oldest,
  ]),
  'old'
)

section('LIFO picks newest with pending')
assert.equal(pickNextBatchByPolicy('LIFO', [oldest, middle, newest]), 'new')
assert.equal(
  pickNextBatchByPolicy('LIFO', [
    oldest,
    middle,
    { ...newest, pending: 0 },
  ]),
  'mid'
)

section('stay on current when a new lote appears')
assert.equal(
  resolveWorkingBatchId({
    mode: 'FIFO',
    workingBatchId: 'old',
    batches: [newest, oldest],
  }),
  'old'
)
assert.equal(
  resolveWorkingBatchId({
    mode: 'LIFO',
    workingBatchId: 'old',
    batches: [newest, oldest],
  }),
  'old'
)

section('advance when pending hits 0')
assert.equal(
  resolveWorkingBatchId({
    mode: 'FIFO',
    workingBatchId: 'old',
    batches: [
      newest,
      middle,
      { ...oldest, pending: 0 },
    ],
  }),
  'mid'
)
assert.equal(
  resolveWorkingBatchId({
    mode: 'LIFO',
    workingBatchId: 'old',
    batches: [
      newest,
      middle,
      { ...oldest, pending: 0 },
    ],
  }),
  'new'
)
assert.equal(
  shouldAutoAdvancePinnedBatch({
    mode: 'FIFO',
    selectedBatchId: 'old',
    workingBatchId: 'old',
    batches: [{ ...oldest, pending: 0 }, newest],
  }),
  true
)
assert.equal(
  shouldAutoAdvancePinnedBatch({
    mode: 'FIFO',
    selectedBatchId: 'old',
    workingBatchId: 'old',
    batches: [oldest, newest],
  }),
  false
)

section('ALL ignores pin')
assert.equal(
  resolveWorkingBatchId({
    mode: 'ALL',
    workingBatchId: 'old',
    batches: [newest, oldest],
  }),
  ''
)
assert.equal(pickNextBatchByPolicy('ALL', [newest, oldest]), '')
assert.equal(
  shouldAutoAdvancePinnedBatch({
    mode: 'ALL',
    selectedBatchId: 'old',
    workingBatchId: 'old',
    batches: [{ ...oldest, pending: 0 }],
  }),
  false
)

section('deep link wins — caller keeps selected when it is not the pin')
assert.equal(
  shouldAutoAdvancePinnedBatch({
    mode: 'FIFO',
    selectedBatchId: 'new',
    workingBatchId: 'old',
    batches: [newest, { ...oldest, pending: 0 }],
  }),
  false
)
assert.equal(
  resolveWorkingBatchId({
    mode: 'FIFO',
    workingBatchId: 'gone',
    batches: [newest, oldest],
  }),
  'old'
)

section('none remaining falls back to Todos')
assert.equal(
  resolveWorkingBatchId({
    mode: 'FIFO',
    workingBatchId: 'old',
    batches: [
      { ...newest, pending: 0 },
      { ...oldest, pending: 0 },
    ],
  }),
  ''
)

section('do not hydrate FIFO/LIFO until pending counts exist')
assert.equal(
  canHydrateBatchQueue({ mode: 'FIFO', batchListReady: true, pendingCountsReady: false }),
  false
)
assert.equal(
  canHydrateBatchQueue({ mode: 'LIFO', batchListReady: true, pendingCountsReady: false }),
  false
)
assert.equal(
  canHydrateBatchQueue({ mode: 'FIFO', batchListReady: true, pendingCountsReady: true }),
  true
)
assert.equal(
  canHydrateBatchQueue({ mode: 'FIFO', batchListReady: false, pendingCountsReady: true }),
  false
)

section('ALL hydrates to Todos without waiting for pending counts')
assert.equal(
  canHydrateBatchQueue({ mode: 'ALL', batchListReady: true, pendingCountsReady: false }),
  true
)
assert.equal(
  canHydrateBatchQueue({ mode: 'ALL', batchListReady: false, pendingCountsReady: false }),
  false
)

section('race: cached batches + pending 0 must not persist null')
const unloaded: QueueBatchInput[] = [
  { ...oldest, pending: 0 },
  { ...newest, pending: 0 },
]
assert.equal(
  resolveWorkingBatchId({ mode: 'FIFO', workingBatchId: 'old', batches: unloaded }),
  ''
)
assert.equal(
  canPersistHydratedWorkingBatch({
    mode: 'FIFO',
    resolvedBatchId: '',
    pendingCountsReady: false,
  }),
  false
)
assert.equal(
  canPersistHydratedWorkingBatch({
    mode: 'FIFO',
    resolvedBatchId: 'old',
    pendingCountsReady: false,
  }),
  true
)
assert.equal(
  canPersistHydratedWorkingBatch({
    mode: 'FIFO',
    resolvedBatchId: '',
    pendingCountsReady: true,
  }),
  true
)
assert.equal(
  canPersistHydratedWorkingBatch({
    mode: 'ALL',
    resolvedBatchId: '',
    pendingCountsReady: true,
  }),
  false
)

section('re-resolve Todos when real pending counts appear')
assert.equal(
  shouldRehydrateEmptyTodos({
    mode: 'FIFO',
    selectedBatchId: '',
    explicitTodos: false,
    deepLinkWins: false,
    pendingCountsReady: true,
    resolvedBatchId: 'old',
  }),
  true
)
assert.equal(
  shouldRehydrateEmptyTodos({
    mode: 'LIFO',
    selectedBatchId: '',
    explicitTodos: false,
    deepLinkWins: false,
    pendingCountsReady: true,
    resolvedBatchId: 'new',
  }),
  true
)
assert.equal(
  shouldRehydrateEmptyTodos({
    mode: 'FIFO',
    selectedBatchId: '',
    explicitTodos: true,
    deepLinkWins: false,
    pendingCountsReady: true,
    resolvedBatchId: 'old',
  }),
  false
)
assert.equal(
  shouldRehydrateEmptyTodos({
    mode: 'FIFO',
    selectedBatchId: '',
    explicitTodos: false,
    deepLinkWins: true,
    pendingCountsReady: true,
    resolvedBatchId: 'old',
  }),
  false
)
assert.equal(
  shouldRehydrateEmptyTodos({
    mode: 'FIFO',
    selectedBatchId: 'old',
    explicitTodos: false,
    deepLinkWins: false,
    pendingCountsReady: true,
    resolvedBatchId: 'mid',
  }),
  false
)
assert.equal(
  shouldRehydrateEmptyTodos({
    mode: 'ALL',
    selectedBatchId: '',
    explicitTodos: false,
    deepLinkWins: false,
    pendingCountsReady: true,
    resolvedBatchId: '',
  }),
  false
)
assert.equal(
  shouldRehydrateEmptyTodos({
    mode: 'FIFO',
    selectedBatchId: '',
    explicitTodos: false,
    deepLinkWins: false,
    pendingCountsReady: false,
    resolvedBatchId: '',
  }),
  false
)

section('auto-advance still refuses Todos (the stuck-picker case)')
assert.equal(
  shouldAutoAdvancePinnedBatch({
    mode: 'FIFO',
    selectedBatchId: '',
    workingBatchId: null,
    batches: [oldest, newest],
  }),
  false
)

console.log('\nbatchQueuePolicy tests passed')
