import { createMemo, createUniqueId, For, Show } from "solid-js";

const COLUMNS = Array.from({ length: 10 }, (_, column) => column);

export function ByteTable(props: {
  bytes: readonly number[];
  label: string;
  headerLength?: number;
  fieldStart?: number;
  onPickStart?: (offset: number) => void;
}) {
  const groupName = createUniqueId();
  const headerLength = () => props.headerLength ?? 0;
  const rowStarts = createMemo(() =>
    Array.from(
      { length: Math.ceil(props.bytes.length / COLUMNS.length) },
      (_, row) => row * COLUMNS.length,
    ),
  );

  return (
    <table aria-label={props.label} class="decoding-byte-table">
      <thead>
        <tr>
          <th scope="col">行首</th>
          <For each={COLUMNS}>{(column) => <th scope="col">+{column}</th>}</For>
        </tr>
      </thead>
      <tbody>
        <For each={rowStarts()}>
          {(start) => (
            <tr>
              <th scope="row">#{start}</th>
              <For each={props.bytes.slice(start, start + COLUMNS.length)}>
                {(byte, column) => {
                  const offset = () => start + column();
                  const marked = () =>
                    props.fieldStart !== undefined &&
                    offset() >= props.fieldStart &&
                    offset() < props.fieldStart + 4;
                  const pickable = () =>
                    Boolean(props.onPickStart) &&
                    offset() + 4 <= Math.min(headerLength(), props.bytes.length);
                  return (
                    <td
                      class={
                        marked() ? "is-field" : offset() < headerLength() ? "is-header" : undefined
                      }
                      title={`data[${offset()}]`}
                    >
                      {byte}
                      <Show when={pickable()}>
                        <input
                          aria-label={`从 #${offset()} 开始，字节值 ${byte}`}
                          checked={props.fieldStart === offset()}
                          class="decoding-byte-choice"
                          name={groupName}
                          onChange={() => props.onPickStart?.(offset())}
                          type="radio"
                        />
                      </Show>
                    </td>
                  );
                }}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}
