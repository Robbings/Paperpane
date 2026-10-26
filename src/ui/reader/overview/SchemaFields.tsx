import { useState } from 'react';
import { Button, HintLabel, IconButton, TextArea } from '@/ui/components';

/** One row of a structured card: shown as its title, described to the model by its description. */
export interface SchemaField {
  key: string;
  title: string;
  description: string;
}

type JsonObject = Record<string, unknown>;
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The parsed schema when the field list can edit it: an object whose properties
 * are all strings. Everything else in it (enum, pattern, additionalProperties,
 * which fields are required…) is kept as it is when the list writes it back.
 */
function parseEditable(schema: string | undefined): { root: JsonObject; properties: Record<string, JsonObject> } | null {
  try {
    const root: unknown = JSON.parse(schema ?? '');
    if (!isObject(root) || root.type !== 'object' || !isObject(root.properties)) return null;
    const properties: Record<string, JsonObject> = {};
    for (const [key, value] of Object.entries(root.properties)) {
      if (!isObject(value) || value.type !== 'string') return null;
      properties[key] = value;
    }
    return { root, properties };
  } catch {
    return null;
  }
}

/**
 * Reads a JSON Schema as a simple field list when it is one: an object whose
 * properties are all strings. Anything richer returns null and is edited as text.
 */
export function schemaToFields(schema: string | undefined): SchemaField[] | null {
  if (!schema?.trim()) return [];
  const parsed = parseEditable(schema);
  if (!parsed) return null;
  return Object.entries(parsed.properties).map(([key, value]) => ({
    key,
    title: typeof value.title === 'string' ? value.title : key,
    description: typeof value.description === 'string' ? value.description : '',
  }));
}

/**
 * The field list as a JSON Schema, in this order. Written over `base` when given,
 * so only names, descriptions, order and added or removed fields change: other
 * constraints stay, fields that were optional stay optional, new fields are required.
 */
export function fieldsToSchema(fields: readonly SchemaField[], base?: string): string {
  const parsed = base ? parseEditable(base) : null;
  const root: JsonObject = parsed?.root ?? { type: 'object' };
  const before = parsed?.properties ?? {};
  const wasRequired = Array.isArray(root.required) ? root.required.filter((key): key is string => typeof key === 'string') : [];

  const properties = Object.fromEntries(
    fields.map((field) => {
      const old = before[field.key];
      const next: JsonObject = { ...old, type: 'string' };
      const title = field.title.trim();
      // A field shown under its key without a title of its own keeps having none.
      if (old && typeof old.title !== 'string' && title === field.key) delete next.title;
      else next.title = title;
      const description = field.description.trim();
      if (description) next.description = description;
      else delete next.description;
      return [field.key, next];
    }),
  );
  const required = fields.filter((field) => (before[field.key] ? wasRequired.includes(field.key) : true)).map((field) => field.key);

  const next: JsonObject = { ...root, type: 'object', properties };
  if (required.length > 0 || 'required' in root) next.required = required;
  return JSON.stringify(next, null, 2);
}

/** Why a schema cannot be used, or undefined when it can. */
export function schemaProblem(schema: string | undefined): string | undefined {
  if (!schema?.trim()) return '结构化卡片至少需要一个字段。';
  try {
    const parsed = JSON.parse(schema) as { type?: unknown; properties?: unknown };
    if (parsed.type !== 'object') return '顶层的 type 需要是 "object"。';
    if (!parsed.properties || typeof parsed.properties !== 'object' || Object.keys(parsed.properties).length === 0) return 'properties 里至少要有一个字段。';
    const fields = schemaToFields(schema);
    if (fields?.some((field) => !field.title.trim())) return '每个字段都需要名称。';
    return undefined;
  } catch {
    return '不是有效的 JSON。';
  }
}

interface SchemaFieldsProps {
  schema: string | undefined;
  onChange: (schema: string) => void;
}

const FIELD_DRAG = 'application/x-paperpane-schema-field';

/** Edits a structured card's fields as a list; the JSON Schema is written for the reader, with a raw view for anything richer. */
export function SchemaFields({ schema, onChange }: SchemaFieldsProps) {
  const fields = schemaToFields(schema);
  const [raw, setRaw] = useState(fields === null);
  const [dragging, setDragging] = useState<number | null>(null);

  const update = (next: SchemaField[]) => onChange(fieldsToSchema(next, schema));
  const newKey = (list: readonly SchemaField[]) => {
    let n = list.length + 1;
    while (list.some((field) => field.key === `field${n}`)) n += 1;
    return `field${n}`;
  };

  if (raw || fields === null) {
    return (
      <div className="pp-ov-fields-edit">
        <TextArea
          label="JSON Schema"
          className="pp-ov-fields-edit__raw"
          value={schema ?? ''}
          onChange={onChange}
          rows={8}
          maxRows={16}
          spellCheck={false}
          error={schema ? schemaProblem(schema) : undefined}
          description={fields === null ? '含有列表或嵌套结构，只能直接编辑' : undefined}
        />
        {fields !== null && (
          <Button size="sm" variant="quiet" className="pp-ov-fields-edit__switch" onClick={() => setRaw(false)}>
            改回字段列表
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="pp-ov-fields-edit">
      <HintLabel hint="每个字段在概览里显示为一行；说明是写给模型看的">字段</HintLabel>
      <ol className="pp-ov-fields-edit__list">
        {fields.map((field, index) => (
          <li
            key={field.key}
            className="pp-ov-fields-edit__row"
            data-dragging={dragging === index ? 'true' : undefined}
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.types).includes(FIELD_DRAG)) event.preventDefault();
            }}
            onDrop={(event) => {
              const from = Number(event.dataTransfer.getData(FIELD_DRAG));
              setDragging(null);
              if (Number.isNaN(from) || from === index) return;
              const next = [...fields];
              const [moved] = next.splice(from, 1);
              next.splice(index, 0, moved!);
              update(next);
            }}
          >
            <span
              className="pp-ov-fields-edit__grip"
              draggable
              aria-hidden="true"
              onDragStart={(event) => {
                event.dataTransfer.setData(FIELD_DRAG, String(index));
                event.dataTransfer.effectAllowed = 'move';
                setDragging(index);
              }}
              onDragEnd={() => setDragging(null)}
            />
            <input
              className="pp-ov-fields-edit__title"
              aria-label={`第 ${index + 1} 个字段的名称`}
              placeholder="名称，如：研究问题"
              value={field.title}
              onChange={(event) => update(fields.map((f, i) => (i === index ? { ...f, title: event.target.value } : f)))}
            />
            <input
              className="pp-ov-fields-edit__description"
              aria-label={`第 ${index + 1} 个字段的说明`}
              placeholder="告诉模型这里写什么（可选）"
              value={field.description}
              onChange={(event) => update(fields.map((f, i) => (i === index ? { ...f, description: event.target.value } : f)))}
            />
            <IconButton icon="close" label={`删除字段「${field.title || index + 1}」`} size="md" shape="pill" onClick={() => update(fields.filter((_, i) => i !== index))} />
          </li>
        ))}
      </ol>
      <div className="pp-ov-fields-edit__actions">
        <Button size="sm" variant="quiet" icon="plus" onClick={() => update([...fields, { key: newKey(fields), title: '', description: '' }])}>
          添加字段
        </Button>
        <span className="pp-ov-fields-edit__spacer" />
        <Button size="sm" variant="quiet" onClick={() => setRaw(true)}>
          直接编辑 JSON Schema
        </Button>
      </div>
    </div>
  );
}
