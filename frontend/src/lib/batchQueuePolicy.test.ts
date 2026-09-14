import assert from 'node:assert/strict'
import {
  parseBatchQueueMode,
  pickNextBatchByPolicy,
  resolveWorkingBatchId,
  shouldAutoAdvancePinnedBatch,
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

console.log('\nbatchQueuePolicy tests passed')
