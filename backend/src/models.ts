import mongoose, { model, Schema } from "mongoose";

const WebsiteSchema = new Schema({
  domain: { type: String, unique: true, required: true },
  isMapped: { type: Boolean, default: false },
});
export const WebsiteModel = model("websites", WebsiteSchema);

const SitemapSchema = new Schema({
  domain: { type: String, required: true },
  url: { type: String, unique: true, required: true },
  title: { type: String },
  description: { type: String },
  embedding: { type: [Number], required: true },
});
export const SitemapModel = model("sitemaps", SitemapSchema);
