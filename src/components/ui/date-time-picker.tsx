"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Clock, X } from "lucide-react";
import { Button } from "@root/components/ui/button";
import { Calendar } from "@root/components/ui/calendar";
import { Input } from "@root/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@root/components/ui/popover";
import { cn } from "@root/lib/utils";

/**
 * Shadcn-style date + time picker.
 *
 * Controlled by an ISO-8601 string. Empty string == no selection.
 * Renders a button with the formatted date/time as its trigger, opens a
 * popover with a `Calendar` + a `time` `<input>` for hour/minute.
 *
 * The split-control design (calendar for date, native time input for time)
 * is the same pattern shadcn ships in its docs — keyboard-friendly, locale-
 * aware time formatting, and zero extra dependencies beyond `react-day-picker`.
 */
export interface DateTimePickerProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Minimum allowed date (defaults to "now"). */
  fromDate?: Date;
  toDate?: Date;
  clearable?: boolean;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date and time",
  disabled,
  className,
  fromDate,
  toDate,
  clearable = true,
}: DateTimePickerProps) {
  const date = value ? new Date(value) : undefined;
  const hasValue = !!date && !Number.isNaN(date.getTime());

  const timeString = React.useMemo(() => {
    if (!hasValue || !date) return "";
    return `${String(date.getHours()).padStart(2, "0")}:${String(
      date.getMinutes(),
    ).padStart(2, "0")}`;
  }, [date, hasValue]);

  function commit(next: Date) {
    onChange(next.toISOString());
  }

  function onDateSelect(picked: Date | undefined) {
    if (!picked) return;
    const next = new Date(picked);
    if (hasValue && date) {
      // Preserve the existing time of day.
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    } else {
      // No prior selection — default to 09:00 local.
      next.setHours(9, 0, 0, 0);
    }
    commit(next);
  }

  function onTimeChange(event: React.ChangeEvent<HTMLInputElement>) {
    const [hStr, mStr] = event.target.value.split(":");
    const h = Number.parseInt(hStr ?? "", 10);
    const m = Number.parseInt(mStr ?? "", 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const base = hasValue && date ? new Date(date) : new Date();
    base.setHours(h, m, 0, 0);
    commit(base);
  }

  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "flex-1 justify-start text-left font-normal",
              !hasValue && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 size-4 shrink-0" />
            {hasValue && date ? (
              <span className="flex items-center gap-2">
                <span>{format(date, "PPP")}</span>
                <span className="text-muted-foreground">·</span>
                <span className="tabular-nums">{format(date, "HH:mm")}</span>
              </span>
            ) : (
              <span>{placeholder}</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={date}
            onSelect={onDateSelect}
            fromDate={fromDate}
            toDate={toDate}
            initialFocus
          />
          <div className="flex items-center gap-2 border-t p-3">
            <Clock className="size-4 text-muted-foreground" />
            <Input
              type="time"
              value={timeString}
              onChange={onTimeChange}
              className="flex-1 font-mono tabular-nums"
              step={60}
            />
          </div>
        </PopoverContent>
      </Popover>
      {clearable && hasValue ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear date"
          onClick={() => onChange("")}
        >
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
