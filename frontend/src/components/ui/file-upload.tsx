"use client";

import React, { useRef, useState } from "react";

export interface FileUploadProps {
  onChange?: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
  className?: string;
}

export function FileUpload({
  onChange,
  multiple = false,
  accept = "image/*",
  className = "",
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const array = Array.from(files);
    setSelectedFiles(array);
    if (onChange) {
      onChange(array);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isDragging) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (isDragging) {
      setIsDragging(false);
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div
      className={`w-full rounded-sm border border-dashed border-[#262626] bg-[#050505] px-4 py-4 text-center text-[11px] font-mono text-muted-foreground transition-colors focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/70 hover:border-primary/50 flex flex-col items-center justify-center gap-2 cursor-pointer ${
        isDragging ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/60" : ""
      } ${className}`}
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <span className="text-[10px] uppercase tracking-[0.3em]">
        {isDragging ? "Release to upload" : "Drop file or click to upload"}
      </span>
      {selectedFiles.length > 0 ? (
        <span className="truncate text-[11px] text-foreground normal-case tracking-normal">
          {multiple
            ? `${selectedFiles.length} file(s) selected`
            : selectedFiles[0]?.name}
        </span>
      ) : (
        <span className="truncate text-[9px] uppercase tracking-[0.25em] text-muted-foreground/70">
          Supported: PNG, JPG, GIF, SVG, WebP
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={multiple}
        accept={accept}
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
}
