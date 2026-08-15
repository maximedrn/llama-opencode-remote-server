import { Model } from "@app/model/model.constants.ts";

/** Compose bind mounts and container paths always want forward slashes. */
const toPosixPath = (path: string): string => path.replaceAll("\\", "/");

/** Default model location, relative to the host home directory. */
const defaultModelDirectory = (home: string): string =>
  toPosixPath([home, ...Model.defaultDirectorySegments].join("/"));

/** Last path segment of a download link, ignoring the query string. */
const fileNameFromUrl = (url: string): string => {
  const withoutQuery: string = toPosixPath(url).split("?")[0] ?? url;
  const segments: string[] = withoutQuery.split("/");
  return segments.at(-1) ?? withoutQuery;
};

/** Served model name: the file name without its directory or extension. */
const modelAlias = (file: string): string => {
  const name: string = toPosixPath(file).split("/").at(-1) ?? file;
  return name.endsWith(Model.extension)
    ? name.slice(0, -Model.extension.length)
    : name;
};

export { defaultModelDirectory, fileNameFromUrl, modelAlias, toPosixPath };
