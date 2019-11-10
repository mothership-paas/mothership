class AddPathToApps < ActiveRecord::Migration[6.0]
  def change
    add_column :apps, :path, :string
  end
end
