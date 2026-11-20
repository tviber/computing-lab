import { useId } from "react";

const COLUMNS = Array.from({ length: 10 }, (_, column) => column);

export function ByteTable({
  bytes,
  label,
  headerLength = 0,
  fieldStart,
  onPickStart,
}: {
  bytes: readonly number[];
  label: string;
  headerLength?: number;
  fieldStart?: number;
  onPickStart?: (offset: number) => void;
}) {
  const groupName = useId();
  return (
    <table aria-label={label} className="decoding-byte-table">
      <thead>
        <tr>
          <th scope="col">行首</th>
          {COLUMNS.map((column) => (
            <th key={column} scope="col">
              +{column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: Math.ceil(bytes.length / COLUMNS.length) }, (_, row) => {
          const start = row * COLUMNS.length;
          return (
            <tr key={start}>
              <th scope="row">#{start}</th>
              {bytes.slice(start, start + COLUMNS.length).map((byte, column) => {
                const offset = start + column;
                const marked =
                  fieldStart !== undefined && offset >= fieldStart && offset < fieldStart + 4;
                return (
                  <td
                    className={
                      marked ? "is-field" : offset < headerLength ? "is-header" : undefined
                    }
                    key={offset}
                    title={`data[${offset}]`}
                  >
                    {byte}
                    {onPickStart && offset + 4 <= Math.min(headerLength, bytes.length) ? (
                      <input
                        aria-label={`从 #${offset} 开始，字节值 ${byte}`}
                        checked={fieldStart === offset}
                        className="decoding-byte-choice"
                        name={groupName}
                        onChange={() => onPickStart(offset)}
                        type="radio"
                      />
                    ) : null}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
