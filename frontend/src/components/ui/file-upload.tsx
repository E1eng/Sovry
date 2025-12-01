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
      className={`w-full border border-dashed rounded-lg px-3 py-2 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 bg-transparent hover:border-neutral-400 dark:hover:border-neutral-500 flex flex-col items-start justify-center cursor-pointer transition-colors ${
        isDragging ? "border-sovry-green/70 bg-sovry-green/5" : "border-neutral-200 dark:border-neutral-700"
      } ${className}`}
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <span className="mb-1">
        Click to upload or drag and drop your file here.
      </span>
      {selectedFiles.length > 0 ? (
        <span className="truncate text-neutral-700 dark:text-neutral-200">
          {multiple
            ? `${selectedFiles.length} file(s) selected`
            : selectedFiles[0]?.name}
        </span>
      ) : (
        <span className="truncate text-neutral-400 dark:text-neutral-500">
          Supported: images (PNG, JPG, GIF, SVG, WebP)
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
