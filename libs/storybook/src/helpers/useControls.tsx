import { useControls as useLevaControls, useStoreContext } from 'leva'

// Provided for using store context by default, otherwise control values are
// shared between stories.
export const useControls = ((
  schemaOrFolderName,
  settingsOrDepsOrSchema,
  depsOrSettingsOrFolderSettings,
  depsOrSettings,
  depsOrUndefined
) => {
  let schema
  let folderName
  let folderSettings
  let settings
  let deps

  if (typeof schemaOrFolderName === 'string') {
    folderName = schemaOrFolderName
    schema = settingsOrDepsOrSchema
    if (Array.isArray(depsOrSettingsOrFolderSettings)) {
      deps = depsOrSettingsOrFolderSettings
    } else {
      if (depsOrSettingsOrFolderSettings != null) {
        if ('store' in depsOrSettingsOrFolderSettings) {
          settings = depsOrSettingsOrFolderSettings
          deps = depsOrSettings
        } else {
          folderSettings = depsOrSettingsOrFolderSettings
          if (Array.isArray(depsOrSettings)) {
            deps = depsOrSettings
          } else {
            settings = depsOrSettings
            deps = depsOrUndefined
          }
        }
      }
    }
  } else {
    schema = schemaOrFolderName
    if (Array.isArray(settingsOrDepsOrSchema)) {
      deps = settingsOrDepsOrSchema
    } else {
      settings = settingsOrDepsOrSchema
      deps = depsOrSettingsOrFolderSettings
    }
  }

  const store = useStoreContext()
  const args = (
    folderName != null
      ? [
          folderName,
          schema ?? {},
          folderSettings ?? {},
          { store, ...settings },
          deps
        ]
      : [schema ?? {}, { store, ...settings }, deps]
  ) as Parameters<typeof useLevaControls>
  return useLevaControls(...args)
}) as typeof useLevaControls
