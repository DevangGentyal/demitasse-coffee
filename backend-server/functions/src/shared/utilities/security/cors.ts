import {Request, Response} from "express";

export const setCustomerCors = (req: Request, res: Response): void => {
  const originHeader = req.get("origin");
  const requestedHeaders = req.get("access-control-request-headers");

  res.set("Vary", "Origin, Access-Control-Request-Headers");
  res.set("Access-Control-Allow-Origin", originHeader || "*");
  res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE");
  res.set("Access-Control-Allow-Headers", requestedHeaders || "Content-Type, Authorization");
  res.set("Access-Control-Max-Age", "3600");
};

export const handleCustomerPreflight = (req: Request, res: Response): boolean => {
  setCustomerCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
};
