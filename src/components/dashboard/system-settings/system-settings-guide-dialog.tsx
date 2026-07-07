"use client";

import { RiBookOpenLine } from "@remixicon/react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SystemSettingsGuideDialogProps {
  triggerLabel: string;
  title: string;
  description: string;
  steps: string[];
}

export function SystemSettingsGuideDialog({
  triggerLabel,
  title,
  description,
  steps,
}: SystemSettingsGuideDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="ml-auto">
          <RiBookOpenLine className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle icon={RiBookOpenLine}>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <ol className="grid list-decimal gap-2 pl-4 text-xs/relaxed text-muted-foreground">
          {steps.map((step) => (
            <li key={step} className="pl-1">
              {step}
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
