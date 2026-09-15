Pod::Spec.new do |s|
  s.name           = 'CreateDocument'
  s.version        = '1.0.0'
  s.summary        = 'Backup folder pick with a security-scoped bookmark, and writes into it'
  s.license        = 'MIT'
  s.author         = 'codejetnet'
  s.homepage       = 'https://github.com/codejetnet/calorie-tracker'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/codejetnet/calorie-tracker.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
