-- Add picture column to projects table for project image uploads
ALTER TABLE projects ADD COLUMN picture VARCHAR(255) NULL AFTER status;
