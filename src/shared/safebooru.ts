import { XMLParser, XMLValidator } from 'fast-xml-parser'

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', parseAttributeValue: false, parseTagValue: false, isArray: (_name, path) => path === 'posts.post' || path === 'tags.tag' })
export function parseSafebooruXml(xml: string, root: 'posts' | 'tags'): Record<string, string>[] {
  if (xml.length > 8 * 1024 * 1024 || /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Safebooru XML 响应无效')
  const parsed = parser.parse(xml)
  if (!Object.hasOwn(parsed, root)) throw new Error('Safebooru 未返回有效列表，可能需要验证或站点暂时不可用')
  const list = parsed[root]?.[root === 'posts' ? 'post' : 'tag'] ?? []
  if (!Array.isArray(list) || list.length > 5000 || list.some(record => !record || typeof record !== 'object')) throw new Error('Safebooru 列表格式无效')
  return list
}
