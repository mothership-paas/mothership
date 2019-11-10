class AddFilenameToApps < ActiveRecord::Migration[6.0]
  def change
    add_column :apps, :filename, :string
  end
end
