export const extractSheetName = (range: string): string => range.split('!')[0] ?? range;
