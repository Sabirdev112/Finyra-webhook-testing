import handler from "../server.js";

export default async function handlerWrapper(req, res) {
  return handler(req, res);
}
