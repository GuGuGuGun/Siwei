import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const DEFAULT_DOCS = 100
const DEFAULT_NODES = 10_000

function parseArgs(argv) {
  const options = {
    docs: DEFAULT_DOCS,
    nodes: DEFAULT_NODES,
    out: join(tmpdir(), 'siwei-library-fixtures'),
    seed: 42,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--docs' && next) {
      options.docs = positiveInt(next, '--docs')
      index += 1
    } else if (arg === '--nodes' && next) {
      options.nodes = positiveInt(next, '--nodes')
      index += 1
    } else if (arg === '--out' && next) {
      options.out = next
      index += 1
    } else if (arg === '--seed' && next) {
      options.seed = positiveInt(next, '--seed')
      index += 1
    } else {
      throw new Error(`未知参数: ${arg}`)
    }
  }

  if (options.docs > options.nodes) {
    throw new Error('--nodes 必须大于或等于 --docs，确保每个文档至少有一个节点')
  }
  return options
}

function positiveInt(value, name) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} 必须是正整数`)
  }
  return parsed
}

function createRandom(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function createNode(docIndex, nodeIndex, random) {
  const isTask = nodeIndex % 5 === 0
  const tagPool = ['项目', '搜索', '后端', '前端', '验收', '索引']
  const tags = [tagPool[(docIndex + nodeIndex) % tagPool.length]]
  if (nodeIndex % 7 === 0) tags.push(tagPool[(docIndex + nodeIndex + 2) % tagPool.length])

  return {
    id: `doc-${docIndex}-node-${nodeIndex}`,
    text: `节点 ${nodeIndex} 可搜索关键词 ${nodeIndex % 11 === 0 ? 'alpha' : 'siwei'} ${Math.floor(random() * 1000)}`,
    note: nodeIndex % 3 === 0 ? `备注内容 ${docIndex}-${nodeIndex} fixture-note` : undefined,
    checked: isTask ? nodeIndex % 10 === 0 : undefined,
    tags,
    createdAt: 1_700_000_000_000 + nodeIndex,
    updatedAt: 1_700_000_000_000 + nodeIndex,
    children: [],
  }
}

function createDocument(docIndex, nodeCount, random) {
  const children = []
  for (let nodeIndex = 1; nodeIndex < nodeCount; nodeIndex += 1) {
    children.push(createNode(docIndex, nodeIndex, random))
  }

  return {
    id: `fixture-doc-${docIndex}`,
    title: `Fixture 文档 ${docIndex}`,
    version: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000 + docIndex,
    root: {
      id: `doc-${docIndex}-root`,
      text: `Fixture 文档 ${docIndex}`,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000 + docIndex,
      children,
    },
  }
}

export async function generateFixtures(options) {
  const outDir = resolve(options.out)
  const random = createRandom(options.seed)
  await mkdir(outDir, { recursive: true })

  const baseNodes = Math.floor(options.nodes / options.docs)
  const remainder = options.nodes % options.docs
  const files = []

  for (let docIndex = 1; docIndex <= options.docs; docIndex += 1) {
    const nodeCount = baseNodes + (docIndex <= remainder ? 1 : 0)
    const document = createDocument(docIndex, nodeCount, random)
    const file = join(outDir, `fixture-${String(docIndex).padStart(3, '0')}.siwei.json`)
    await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, 'utf8')
    files.push(file)
  }

  return { outDir, files }
}

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}` || process.argv[1]?.endsWith('generate-library-fixtures.mjs')) {
  try {
    const options = parseArgs(process.argv.slice(2))
    const result = await generateFixtures(options)
    console.log(`已生成 ${result.files.length} 个文档: ${result.outDir}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
