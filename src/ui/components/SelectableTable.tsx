import { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";

type TableValue = string | number | null | undefined;

type SelectableTableCellData = {
    value: TableValue;
    selectable?: boolean;
    color?: string;
};

type SelectableTableCell = TableValue | SelectableTableCellData;

export type SelectableTableColumn<CellId extends string = string> = {
    id: CellId;
    label: string;
    selectable?: boolean;
};

export type SelectableTableRow<
    RowId extends string = string,
    CellId extends string = string
> = {
    id: RowId;
    cells: Record<CellId, SelectableTableCell>;
};

type Props<RowId extends string = string, CellId extends string = string> = {
    columns: SelectableTableColumn<CellId>[];
    rows: SelectableTableRow<RowId, CellId>[];
    onSelect: (rowId: RowId, cellId: CellId) => void;
    focusedCellBackgroundColor?: string;
    focusedCellTextColor?: string;
};

function padRight(value: string, width: number): string {
    return value.padEnd(Math.max(width, 0), " ");
}

function isCellData(value: SelectableTableCell): value is SelectableTableCellData {
    return typeof value === "object" && value !== null && "value" in value;
}

function getCellDisplayValue(cell: SelectableTableCell): string {
    if (isCellData(cell)) {
        return String(cell.value ?? "");
    }
    return String(cell ?? "");
}

function hasDisplayValue(value: string): boolean {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed !== "-";
}

function findClosestSelectableColumn(
    row: boolean[] | undefined,
    preferredColumnIndex: number
): number | null {
    if (!row) return null;
    if (row[preferredColumnIndex]) return preferredColumnIndex;

    for (let distance = 1; distance < row.length; distance++) {
        const left = preferredColumnIndex - distance;
        const right = preferredColumnIndex + distance;
        if (left >= 0 && row[left]) return left;
        if (right < row.length && row[right]) return right;
    }

    return null;
}

type HorizontalDirection = "left" | "right";

function findClosestSelectableCellHorizontally(
    matrix: boolean[][],
    fromRowIndex: number,
    fromColumnIndex: number,
    direction: HorizontalDirection
): { rowIndex: number; columnIndex: number } | null {
    let best: { rowIndex: number; columnIndex: number } | null = null;
    let bestColumnDistance = Number.POSITIVE_INFINITY;
    let bestRowDistance = Number.POSITIVE_INFINITY;

    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
        const row = matrix[rowIndex];
        if (!row) continue;

        for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
            if (!row[columnIndex]) continue;
            if (rowIndex === fromRowIndex && columnIndex === fromColumnIndex) continue;

            if (direction === "left" && columnIndex >= fromColumnIndex) continue;
            if (direction === "right" && columnIndex <= fromColumnIndex) continue;

            const columnDistance = Math.abs(columnIndex - fromColumnIndex);
            const rowDistance = Math.abs(rowIndex - fromRowIndex);

            if (
                columnDistance < bestColumnDistance ||
                (columnDistance === bestColumnDistance &&
                    rowDistance < bestRowDistance)
            ) {
                best = { rowIndex, columnIndex };
                bestColumnDistance = columnDistance;
                bestRowDistance = rowDistance;
            }
        }
    }

    return best;
}

export default function SelectableTable<
    RowId extends string = string,
    CellId extends string = string
>({
    columns,
    rows,
    onSelect,
    focusedCellBackgroundColor = "black",
    focusedCellTextColor = "green",
}: Props<RowId, CellId>) {
    const [focusedRowIndex, setFocusedRowIndex] = useState(0);
    const [focusedColumnIndex, setFocusedColumnIndex] = useState(0);

    const columnWidths = useMemo(() => {
        return columns.map((column) => {
            const contentWidths = rows.map((row) => {
                const value = row.cells[column.id];
                return getCellDisplayValue(value).length;
            });

            const widest = Math.max(column.label.length, ...contentWidths);
            return widest + 2;
        });
    }, [columns, rows]);

    const selectableMatrix = useMemo(() => {
        return rows.map((row) =>
            columns.map((column) => {
                const cell = row.cells[column.id];
                const value = getCellDisplayValue(cell);
                const columnSelectable = column.selectable !== false;
                const cellSelectable =
                    !isCellData(cell) || cell.selectable !== false;
                return (
                    columnSelectable &&
                    cellSelectable &&
                    hasDisplayValue(value)
                );
            })
        );
    }, [columns, rows]);

    const firstSelectableCell = useMemo(() => {
        for (let rowIndex = 0; rowIndex < selectableMatrix.length; rowIndex++) {
            const row = selectableMatrix[rowIndex];
            if (!row) continue;
            for (
                let columnIndex = 0;
                columnIndex < row.length;
                columnIndex++
            ) {
                if (row[columnIndex]) {
                    return { rowIndex, columnIndex };
                }
            }
        }
        return null;
    }, [selectableMatrix]);

    useEffect(() => {
        if (!firstSelectableCell) {
            setFocusedRowIndex(0);
            setFocusedColumnIndex(0);
            return;
        }

        const currentIsSelectable =
            selectableMatrix[focusedRowIndex]?.[focusedColumnIndex] === true;
        if (currentIsSelectable) return;

        setFocusedRowIndex(firstSelectableCell.rowIndex);
        setFocusedColumnIndex(firstSelectableCell.columnIndex);
    }, [
        firstSelectableCell,
        focusedColumnIndex,
        focusedRowIndex,
        selectableMatrix,
    ]);

    useInput(
        (_input, key) => {
            if (rows.length === 0 || columns.length === 0 || !firstSelectableCell) {
                return;
            }

            if (key.upArrow) {
                for (let rowIndex = focusedRowIndex - 1; rowIndex >= 0; rowIndex--) {
                    const nextColumnIndex = findClosestSelectableColumn(
                        selectableMatrix[rowIndex],
                        focusedColumnIndex
                    );
                    if (nextColumnIndex !== null) {
                        setFocusedRowIndex(rowIndex);
                        setFocusedColumnIndex(nextColumnIndex);
                        return;
                    }
                }
                return;
            }

            if (key.downArrow) {
                for (
                    let rowIndex = focusedRowIndex + 1;
                    rowIndex < rows.length;
                    rowIndex++
                ) {
                    const nextColumnIndex = findClosestSelectableColumn(
                        selectableMatrix[rowIndex],
                        focusedColumnIndex
                    );
                    if (nextColumnIndex !== null) {
                        setFocusedRowIndex(rowIndex);
                        setFocusedColumnIndex(nextColumnIndex);
                        return;
                    }
                }
                return;
            }

            if (key.leftArrow) {
                const nextCell = findClosestSelectableCellHorizontally(
                    selectableMatrix,
                    focusedRowIndex,
                    focusedColumnIndex,
                    "left"
                );
                if (nextCell) {
                    setFocusedRowIndex(nextCell.rowIndex);
                    setFocusedColumnIndex(nextCell.columnIndex);
                }
                return;
            }

            if (key.rightArrow) {
                const nextCell = findClosestSelectableCellHorizontally(
                    selectableMatrix,
                    focusedRowIndex,
                    focusedColumnIndex,
                    "right"
                );
                if (nextCell) {
                    setFocusedRowIndex(nextCell.rowIndex);
                    setFocusedColumnIndex(nextCell.columnIndex);
                }
                return;
            }

            if (key.return) {
                if (!selectableMatrix[focusedRowIndex]?.[focusedColumnIndex]) {
                    return;
                }

                const selectedRow = rows[focusedRowIndex];
                const selectedColumn = columns[focusedColumnIndex];

                if (!selectedRow || !selectedColumn) {
                    return;
                }

                onSelect(selectedRow.id, selectedColumn.id);
            }
        },
        { isActive: rows.length > 0 && columns.length > 0 && !!firstSelectableCell }
    );

    return (
        <Box flexDirection="column">
            <Box>
                {columns.map((column, columnIndex) => (
                    <Box
                        key={column.id}
                        marginRight={columnIndex < columns.length - 1 ? 1 : 0}
                    >
                        <Text bold>
                            {padRight(
                                column.label,
                                columnWidths[columnIndex] ?? 0
                            )}
                        </Text>
                    </Box>
                ))}
            </Box>

            {rows.map((row, rowIndex) => (
                <Box key={row.id}>
                    {columns.map((column, columnIndex) => {
                        const isFocused =
                            rowIndex === focusedRowIndex &&
                            columnIndex === focusedColumnIndex;
                        const cell = row.cells[column.id];
                        const value = getCellDisplayValue(cell);
                        const cellColor = isCellData(cell) ? cell.color : undefined;

                        return (
                            <Box
                                key={`${row.id}-${column.id}`}
                                marginRight={
                                    columnIndex < columns.length - 1 ? 1 : 0
                                }
                            >
                                <Text
                                    backgroundColor={
                                        isFocused
                                            ? focusedCellBackgroundColor
                                            : undefined
                                    }
                                    color={
                                        isFocused
                                            ? focusedCellTextColor
                                            : cellColor
                                    }
                                >
                                    {padRight(
                                        value,
                                        columnWidths[columnIndex] ?? 0
                                    )}
                                </Text>
                            </Box>
                        );
                    })}
                </Box>
            ))}
        </Box>
    );
}
