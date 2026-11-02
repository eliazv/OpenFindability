require "minitest/autorun"
require "tmpdir"
require "fileutils"

# Load shared preparation helpers without executing Fastlane lanes or native tools.
def default_platform(*) = nil
def platform(*) = nil
def sh(*args) = ($commands << [Dir.pwd, args])
module UI
  def self.user_error!(message) = raise(message)
end
module Xcodeproj
  class Project
    class << self
      attr_accessor :fixture
      def open(*) = fixture
    end
  end
end
$LOADED_FEATURES << "xcodeproj.rb"
load File.join(__dir__, "fastlane", "Fastfile")

class BuilderPreparationTest < Minitest::Test
  Configuration = Struct.new(:build_settings)
  Target = Struct.new(:name, :build_configurations)
  NativeProject = Struct.new(:targets, :saved) do
    def save = self.saved = true
  end

  def setup
    $commands = []
    @old_version, @old_build = ENV["BUILD_NAME"], ENV["BUILD_NUMBER"]
    ENV["BUILD_NAME"], ENV["BUILD_NUMBER"] = "2.130", "151"
  end

  def teardown
    ENV["BUILD_NAME"], ENV["BUILD_NUMBER"] = @old_version, @old_build
  end

  def test_flutter_preparation_keeps_locks_and_nested_app_directory
    Dir.mktmpdir do |root|
      app = File.join(root, "apps", "demo")
      FileUtils.mkdir_p(File.join(app, "ios"))
      prepare_app({ "framework" => "flutter" }, app)
      assert_equal ["flutter", "pub", "get", "--enforce-lockfile"], $commands[0][1]
      assert_equal app, $commands[0][0]
      assert_includes $commands[1][1], "--config-only"
      assert_equal [File.join(app, "ios"), ["pod", "install", "--deployment"]], $commands[2]
    end
  end

  def test_capacitor_preparation_builds_web_syncs_locked_pods_and_overrides_native_versions
    Dir.mktmpdir do |app|
      File.write(File.join(app, "package-lock.json"), "{}")
      settings = { "MARKETING_VERSION" => "old", "CURRENT_PROJECT_VERSION" => "old" }
      project = NativeProject.new([Target.new("App", [Configuration.new(settings)])], false)
      Xcodeproj::Project.fixture = project
      prepare_app({ "framework" => "capacitor", "targets" => { "App" => "com.example.demo" }, "webBuildScript" => "build:ios" }, app)
      assert_equal [["npm", "ci"], ["npm", "run", "build:ios"], ["npx", "--no-install", "cap", "sync", "ios", "--deployment"]], $commands.map(&:last)
      assert_equal "2.130", settings["MARKETING_VERSION"]
      assert_equal "151", settings["CURRENT_PROJECT_VERSION"]
      assert project.saved
    end
  end

  def test_refresh_removes_the_stale_lock_and_drops_deployment_mode
    ENV["REFRESH_PODS"] = "1"
    Dir.mktmpdir do |app|
      FileUtils.mkdir_p(File.join(app, "ios"))
      lock = File.join(app, "ios", "Podfile.lock")
      File.write(lock, "stale")
      prepare_app({ "framework" => "flutter" }, app)
      refute File.exist?(lock)
      assert_equal ["pod", "repo", "update"], $commands.first.last
      assert_equal ["pod", "install"], $commands.last.last
    end
  ensure
    ENV.delete("REFRESH_PODS")
  end

  def test_firebase_version_is_written_first_in_the_podfile
    Dir.mktmpdir do |app|
      FileUtils.mkdir_p(File.join(app, "ios"))
      podfile = File.join(app, "ios", "Podfile")
      File.write(podfile, "platform :ios
")
      apply_firebase_sdk_version({ "framework" => "flutter" }, app)
      assert_equal "platform :ios
", File.read(podfile)
      apply_firebase_sdk_version({ "framework" => "flutter", "firebaseSdkVersion" => "12.19.0" }, app)
      assert_equal "$FirebaseSDKVersion = '12.19.0'
platform :ios
", File.read(podfile)
    end
  end

  def test_pod_deployment_targets_are_only_raised
    settings = [{ "IPHONEOS_DEPLOYMENT_TARGET" => "11.0" }, { "IPHONEOS_DEPLOYMENT_TARGET" => "16.0" }, {}]
    raise_deployment_targets(settings.map { |value| Configuration.new(value) })
    assert_equal [{ "IPHONEOS_DEPLOYMENT_TARGET" => "15.0" }, { "IPHONEOS_DEPLOYMENT_TARGET" => "16.0" }, {}], settings
  end

  def test_profile_mapping_needs_an_app_store_profile_for_every_bundle
    app = { "teamId" => "ABCDEFGHIJ", "bundleIds" => ["com.example.demo", "com.example.demo.Widget"] }
    store = ->(name, bundle) { { "Name" => name, "TeamIdentifier" => ["ABCDEFGHIJ"], "Entitlements" => { "application-identifier" => "ABCDEFGHIJ.#{bundle}" } } }
    main = store.call("Main", "com.example.demo")
    widget = store.call("Widget", "com.example.demo.Widget")
    adhoc = store.call("AdHoc", "com.example.demo").merge("ProvisionedDevices" => ["x"])
    assert_equal({ "com.example.demo" => "Main", "com.example.demo.Widget" => "Widget" }, profile_mapping([adhoc, widget, main], app))
    assert_raises(RuntimeError) { profile_mapping([main], app) }
    assert_raises(RuntimeError) { profile_mapping([main.merge("TeamIdentifier" => ["OTHER"]), widget], app) }
  end

  def test_capacitor_missing_lock_fails_before_install_or_build
    Dir.mktmpdir do |app|
      assert_raises(RuntimeError) { prepare_app({ "framework" => "capacitor" }, app) }
      assert_empty $commands
    end
  end
end
