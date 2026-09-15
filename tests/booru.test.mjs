import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePictures, query, validateSearch, Viewed, visualPage } from '../src/shared/booru.ts'
import { defaults } from '../src/shared/types.ts'

test('重复浏览不污染已读前缀，旧负偏移记录可重载', () => {
  const first = new Viewed()
  for (let visit = 0; visit < 17; visit++) for (let id = 1000; id < 1060; id++) first.add(id)
  const saved = first.encode(), loaded = new Viewed(saved)
  assert.equal(parsePictures([{ id: 1000, width: 1280, height: 720, rating: 's' }], defaults, loaded)[0].viewed, true)
  assert.equal(loaded.encode(), saved)
  const recovered = new Viewed('0,1001;-1,59')
  const reloaded = new Viewed(recovered.encode())
  for (const id of [0, 999, 1000, 1001, 1059]) assert.equal(reloaded.has(id), true)
  assert.equal(reloaded.has(1060), false)
  for (const bad of ['0,100;-101,1', '0,100;1,-1', '0,100;;1,1', '1;2', '0,9007199254740991;1,1']) assert.throws(() => new Viewed(bad))
})

test('源查询、字段、过滤、已读和展示页聚合', async () => {
  const input = { ...defaults, keyword: 'blue_hair & sky', count: 10 }
  assert.deepEqual(Object.fromEntries(new URL(query(input)).searchParams), { page: '1', limit: '10', tags: 'blue_hair & sky rating:safe' })
  assert.throws(() => validateSearch({ ...input, page: 0 }))
  assert.throws(() => validateSearch({ ...input, count: 501 }))
  const raw = id => ({ id, width: 1280, height: 720, rating: 's', created_at: 1704067200, score: 42, author: 'sample', tags: ' landscape  sky', preview_url: 'https://konachan.net/a.jpg', sample_url: 'https://konachan.net/b.jpg' })
  const seen = new Viewed('0,100;20,1')
  const picture = parsePictures([raw(120)], input, seen)[0]
  assert.equal(picture.viewed, true)
  assert.deepEqual(picture.tags, ['landscape', '', 'sky'])
  assert.equal(picture.date, '2024-01-01 0:00:00')
  assert.equal(picture.original, '')
  assert.equal(parsePictures([raw(200)], input, seen)[0].viewed, false)
  assert.equal(parsePictures([raw(200)], input, seen)[0].viewed, false)
  assert.equal(new Viewed(seen.encode()).has(200), true)
  assert.equal(parsePictures([raw(201)], { ...input, orientation: 2 }, seen)[0].filtered, true)
  assert.equal(parsePictures([{ ...raw(202), rating: 'e' }], input, seen)[0].filtered, true)
  assert.equal(parsePictures([raw(203)], { ...input, filterResolution: true, minWidth: 1500 }, seen)[0].filtered, true)
  const calls = []
  const result = await visualPage(input, 1, 1, 0, seen, async url => {
    const page = Number(new URL(url).searchParams.get('page')); calls.push(page)
    return Array.from({ length: 10 }, (_, i) => ({ ...raw(page * 100 + i), rating: i < 5 ? 's' : 'e' }))
  }, new AbortController().signal)
  assert.deepEqual(calls, [1, 2])
  assert.equal(result.items.length, 20)
  assert.equal(result.nextPage, 3)
  assert.equal(result.complete, false)
  const empty = await visualPage(input, 3, 2, 20, seen, async () => [], new AbortController().signal)
  assert.equal(empty.complete, true)
  const error = await visualPage(input, 1, 1, 0, seen, async () => { throw new Error('offline') }, new AbortController().signal)
  assert.equal(error.error, 'offline')
  const cancellation = new AbortController()
  await assert.rejects(visualPage(input, 1, 1, 0, seen, async () => { cancellation.abort(); return [raw(300)] }, cancellation.signal))
})
