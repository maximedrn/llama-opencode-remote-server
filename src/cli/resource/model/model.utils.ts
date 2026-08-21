import { Model } from "@app/cli/resource/model/model.constants.ts";
import { Option } from "effect";

/** Compose bind mounts and container paths always want forward slashes. */
const toPosixPath = (path: string): string => path.replaceAll("\\", "/");

/** Default model location, relative to the host home directory. */
const defaultModelDirectory = (home: string): string =>
  toPosixPath([home, ...Model.defaultDirectorySegments].join("/"));

/** Query string and fragment are addressing, never part of the file name. */
const urlDecoration = /[?#]/;

/**
 * Last path segment of a download link. `None` unless that segment really is a
 * model file: a link ending on a directory, or naming the file in its query
 * only, leaves nothing to save the download under.
 */
const fileNameFromUrl = (url: string): Option.Option<string> =>
  Option.fromNullable(
    toPosixPath(url).split(urlDecoration)[0]?.split("/").at(-1),
  ).pipe(
    Option.filter((name: string): boolean => name.endsWith(Model.extension)),
  );

/** Served model name: the file name without its directory or extension. */
const modelAlias = (file: string): string => {
  const name: string = toPosixPath(file).split("/").at(-1) ?? file;
  return name.endsWith(Model.extension)
    ? name.slice(0, -Model.extension.length)
    : name;
};

export { defaultModelDirectory, fileNameFromUrl, modelAlias, toPosixPath };
