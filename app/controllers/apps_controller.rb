require 'docker'

class AppsController < ApplicationController
  before_action :set_app, only: [:show, :edit, :update, :destroy]

  # GET /apps
  # GET /apps.json
  def index
    @apps = App.all
  end

  # GET /apps/1
  # GET /apps/1.json
  def show
  end

  # GET /apps/new
  def new
    @app = App.new
  end

  # GET /apps/1/edit
  def edit
  end

  # POST /apps
  # POST /apps.json
  def create
    @app = App.new(
      title: app_params[:title],
      path: "./public/uploads/#{app_params[:app_file].original_filename}",
      filename: app_params[:app_file].original_filename
    )

    respond_to do |format|
      if @app.save
        upload
        File.open("Dockerfile","w") do |file|
          file.puts <<~HEREDOC
          FROM ruby:2.6
          COPY #{@app.path} /usr/src/app/
          WORKDIR /usr/src/app
          RUN unzip #{@app.filename}
          RUN bundle install
          EXPOSE 4567

          CMD ["bundle", "exec", "puma", "-t", "5:5", "-p", "4567"]
          HEREDOC
        end

        Docker::Image.build_from_dir('.')

        # create docker image from code
          # unzip the code file
        # user docker-machine to deploy image to new do droplete
        format.html { redirect_to @app, notice: 'App was successfully created.' }
        format.json { render :show, status: :created, location: @app }
      else
        format.html { render :new }
        format.json { render json: @app.errors, status: :unprocessable_entity }
      end
    end
  end

  # PATCH/PUT /apps/1
  # PATCH/PUT /apps/1.json
  def update
    respond_to do |format|
      if @app.update(app_params)
        format.html { redirect_to @app, notice: 'App was successfully updated.' }
        format.json { render :show, status: :ok, location: @app }
      else
        format.html { render :edit }
        format.json { render json: @app.errors, status: :unprocessable_entity }
      end
    end
  end

  # DELETE /apps/1
  # DELETE /apps/1.json
  def destroy
    @app.destroy
    respond_to do |format|
      format.html { redirect_to apps_url, notice: 'App was successfully destroyed.' }
      format.json { head :no_content }
    end
  end

  private
    # Use callbacks to share common setup or constraints between actions.
    def set_app
      @app = App.find(params[:id])
    end

    # Never trust parameters from the scary internet, only allow the white list through.
    def app_params
      params.require(:app).permit(:title, :app_file)
    end

    def upload
      uploaded_io = app_params[:app_file]
      File.open(
        Rails.root.join('public', 'uploads', uploaded_io.original_filename), 
        'wb'
      ) do |file|
        file.write(uploaded_io.read)
      end
    end

    # def unzip_file (file, destination)
    #   ZipFile.open(file) do |zip_file|
    #     zip_file.each do |f|
    #       f_path=File.join(destination, f.name)
    #       FileUtils.mkdir_p(File.dirname(f_path))
    #       zip_file.extract(f, f_path) unless File.exist?(f_path)
    #     end
    #   end
    # end
end
