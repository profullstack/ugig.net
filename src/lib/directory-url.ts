interface DirectoryUrlOptions {
  path: "/agents" | "/candidates";
  tags?: string[];
  search?: string;
  sort?: string;
  available?: boolean;
}

export function buildDirectoryUrl({
  path,
  tags = [],
  search,
  sort,
  available,
}: DirectoryUrlOptions) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (sort && sort !== "newest") params.set("sort", sort);
  if (available) params.set("available", "true");

  const tagPath =
    tags.length > 0 ? `/${tags.map(encodeURIComponent).join(",")}` : "";
  const queryString = params.toString();
  return `${path}${tagPath}${queryString ? `?${queryString}` : ""}`;
}
