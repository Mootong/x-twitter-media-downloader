# Privacy Policy

Effective date: July 31, 2026

Media Downloader for X is an unofficial browser extension that helps users scan
media posts visible to them on X and download selected files.

## Data handled by the extension

The extension processes only the data needed for its user-facing media scanning
and download features:

- X usernames entered by the user and recently used username history.
- Media post identifiers, dates, author handles, media URLs, and video variant
  metadata visible on X pages the user chooses to scan.
- Scan settings, progress, selected items, and generated download filenames.

The extension does not request or read passwords, authentication cookies,
private messages, payment information, or the user's general browser history.

## How data is used and stored

Settings, username history, progress, and scan results are stored locally using
Chrome extension storage. They are used only to provide the extension's single
purpose: scanning, previewing, and downloading media selected by the user.

The developer does not operate a server that receives this data. The extension
does not sell user data, use it for advertising or profiling, or allow the
developer or other humans to read it.

## External communications

- X and its media CDN receive the normal page and media requests necessary to
  display and download content.
- If the user explicitly downloads an HLS or DASH video and grants the optional
  localhost permission, the manifest URL and output filename are sent to an
  optional helper running only at `127.0.0.1` on the same computer.
- No extension data is transferred to advertising, analytics, or unrelated
  third-party services.

## Retention and deletion

Local data remains until it is replaced by a later scan, cleared through
Chrome's extension data controls, or removed when the extension is uninstalled.
Downloaded media remains under the user's control in their Downloads folder.

## Limited Use

The extension's use of information received from browser permissions is limited
to providing and improving its prominently disclosed, user-facing media
scanning and download functionality. The data is not transferred for
personalized advertising, creditworthiness, lending, or sale to data brokers.

## User responsibility

Users must only download media they own or are authorized to save and must
comply with applicable law and the terms of the source service. The extension is
not affiliated with or endorsed by X Corp.

## Changes and contact

Material changes to this policy will be disclosed in the extension listing and
release notes before changed data handling begins.

Questions or privacy requests may be submitted through the project's public
issue tracker:

https://github.com/Mootong/x-twitter-media-downloader/issues
