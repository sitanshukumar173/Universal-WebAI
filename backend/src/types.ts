export type ExtractSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type ExtractCompatRequest = {
  formats: ["extract"];
  extract: {
    prompt: string;
    schema: ExtractSchema;
  };
};

export type ExtractCompatResult = {
  success: boolean;
  extract?: {
    answer?: string;
    found_in_pdf?: boolean;
    details?: string;
    [key: string]: unknown;
  };
};

export type VectorSearchHit = {
  url: string;
  score: number;
};
